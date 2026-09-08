import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ProfileContent } from '../../app/(tabs)/(profile)/index';
import { AddressesContent } from '../../app/(tabs)/(profile)/addresses';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access'), deleteItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false }, useFocusEffect: jest.fn() }));
const response = (body: unknown, status = 200) => ({ headers: new Headers(), ok: status < 400, status, text: async () => JSON.stringify(body) }) as Response;
const address = { id: 'address1', recipient_name: 'מאיה', phone_e164: '+972501234567', street: 'הרצל', building: '12', apartment: null, city: 'חיפה', postal_code: null, country: 'IL', is_default: false, created_at: '', updated_at: '' };
function provider(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/users/me')) return response({ display_name: 'מאיה', phone_e164: '+972501234567', role: 'customer', id: 'user1', is_active: true });
    if (url.includes('unread-count')) return response({ unread_count: 3 });
    if (url.endsWith('/addresses')) return response([address]);
    if (url.endsWith('/addresses/address1')) return response({ ...address, is_default: true });
    return response([]);
  });
});
it('shows real profile details, supported activity links and confirms logout', async () => {
  const logout = jest.fn().mockResolvedValue(undefined);
  await render(provider(<ProfileContent sessionScope="s1" logout={logout} />));
  expect(await screen.findByText('מאיה')).toBeOnTheScreen();
  expect(screen.getByText(/972501234567/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /התראות, / })).toBeNull();
  for (const [label, path] of [
    ['פרטים אישיים', '/(tabs)/(profile)/personal'],
    ['שאלות נפוצות', '/(tabs)/(profile)/faq'],
    ['צרו קשר', '/(tabs)/(profile)/contact'],
    ['הגדרות', '/(tabs)/(profile)/settings'],
  ]) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(router.push).toHaveBeenCalledWith(path);
  }
  await fireEvent.press(screen.getByRole('button', { name: 'כתובות' }));
  expect(router.push).toHaveBeenCalledWith('/(tabs)/(profile)/addresses');
  await fireEvent.press(screen.getByRole('button', { name: 'יציאה' }));
  expect(logout).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'אישור יציאה' }));
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
it('uses an owned address command and reconciles the server default', async () => {
  let isDefault = false;
  globalThis.fetch = jest.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') { isDefault = true; return response({ ...address, is_default: true }); }
    return response([{ ...address, is_default: isDefault }]);
  });
  await render(provider(<AddressesContent sessionScope="s1" />));
  await fireEvent.press(await screen.findByRole('button', { name: 'הגדרה כברירת מחדל: הרצל 12, חיפה' }));
  expect(await screen.findByText('כתובת ברירת מחדל')).toBeOnTheScreen();
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/users/me/addresses/address1'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_default: true }) }));
});
it('keeps an address visible when ownership/deletion is rejected', async () => {
  globalThis.fetch = jest.fn().mockImplementation(async (_url: string, options?: RequestInit) => options?.method === 'DELETE' ? response({ code: 'address_not_found' }, 404) : response([address]));
  await render(provider(<AddressesContent sessionScope="s1" />));
  await fireEvent.press(await screen.findByRole('button', { name: 'מחיקת כתובת: הרצל 12, חיפה' }));
  await fireEvent.press(screen.getByRole('button', { name: 'אישור מחיקה' }));
  expect(await screen.findByText('לא הצלחנו לשמור את השינוי. נסו שוב.')).toBeOnTheScreen();
  expect(screen.getByText('הרצל 12, חיפה')).toBeOnTheScreen();
});
it('validates, adds and edits Israeli addresses through the signed-in API', async () => {
  const addresses: (typeof address)[] = [];
  globalThis.fetch = jest.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') { addresses.push(address); return response(address); }
    if (options?.method === 'PATCH') { addresses[0] = { ...address, city: 'תל אביב' }; return response(addresses[0]); }
    return response(addresses);
  });
  await render(provider(<AddressesContent sessionScope="s1" />));
  await screen.findByText('עדיין אין כתובות שמורות.');
  await fireEvent.press(screen.getByRole('button', { name: 'הוספת כתובת חדשה' }));
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת כתובת' }));
  expect(screen.getByText('יש להזין רחוב.')).toBeOnTheScreen();
  for (const [label, value] of [['שם מקבל או מקבלת', 'מאיה'], ['טלפון', '0501234567'], ['רחוב', 'הרצל'], ['מספר בית', '12'], ['עיר', 'חיפה']]) {
    await fireEvent.changeText(screen.getByLabelText(label!), value!);
  }
  await fireEvent.changeText(screen.getByLabelText('טלפון'), '050אב-1234567890');
  expect(screen.getByLabelText('טלפון')).toHaveDisplayValue('0501234567');
  await fireEvent.changeText(screen.getByLabelText('מיקוד (לא חובה)'), '001אב-23xyz45');
  expect(screen.getByLabelText('מיקוד (לא חובה)')).toHaveDisplayValue('0012345');
  await fireEvent.changeText(screen.getByLabelText('טלפון'), '050123456');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת כתובת' }));
  expect(screen.getByText('יש להזין מספר נייד ישראלי בן 10 ספרות.')).toBeOnTheScreen();
  expect(addresses).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText('טלפון'), '0501234567');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת כתובת' }));
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/addresses'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('"postal_code":"0012345"') }));
  await fireEvent.press(await screen.findByRole('button', { name: 'עריכת כתובת: הרצל 12, חיפה' }));
  expect(screen.getByLabelText('טלפון')).toHaveDisplayValue('0501234567');
  await fireEvent.changeText(screen.getByLabelText('עיר'), 'תל אביב');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת כתובת' }));
  expect(await screen.findByText('הרצל 12, תל אביב')).toBeOnTheScreen();
});

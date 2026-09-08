import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ProfileGate } from '../../src/features/profile/ProfileGate';
import { PersonalDetails } from '../../src/features/profile/PersonalDetails';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access') }));
const mockSession = { status: 'authenticated', sessionScope: 's1', logout: jest.fn().mockResolvedValue(undefined) };
jest.mock('../../src/features/auth/useSession', () => ({ useSession: () => mockSession }));
const profile = { id: 'u1', display_name: null, email: null, phone_e164: '+972501234567', profile_complete: false, role: 'customer' as const, is_active: true };
const response = (body: unknown, status = 200) => ({ headers: new Headers(), ok: status < 400, status, text: async () => JSON.stringify(body) }) as Response;
function provider(children: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>;
}
beforeEach(() => { jest.clearAllMocks(); mockSession.sessionScope = 's1'; mockSession.status = 'authenticated'; });

it('blocks application content until a required name is confirmed by the server', async () => {
  let save: ((value: Response) => void) | undefined;
  globalThis.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => options?.method === 'PATCH'
    ? new Promise<Response>(resolve => { save = resolve; }) : Promise.resolve(response(profile)));
  await render(provider(<ProfileGate><Text>Deep-linked application</Text></ProfileGate>));
  expect(await screen.findByText('השלמת פרטים אישיים')).toBeOnTheScreen();
  expect(screen.queryByText('Deep-linked application')).toBeNull();
  expect(screen.getByLabelText('מספר טלפון מאומת').props.editable).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'שמירה והמשך' }));
  expect(screen.getByText('יש להזין שם מלא.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('שם מלא *'), ' מאיה לוי ');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירה והמשך' }));
  await waitFor(() => expect(save).toBeDefined());
  expect(screen.queryByText('Deep-linked application')).toBeNull();
  save!(response({ ...profile, display_name: 'מאיה לוי', profile_complete: true }));
  expect(await screen.findByText('Deep-linked application')).toBeOnTheScreen();
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/users/me'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ display_name: 'מאיה לוי', email: null }) }));
});

it('keeps the form and entered details after failed saves and accepts optional email', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(response({ code: 'unavailable' }, 503));
  const saved = jest.fn();
  await render(provider(<PersonalDetails profile={profile} sessionScope="s1" onSaved={saved} />));
  await fireEvent.changeText(screen.getByLabelText('שם מלא *'), 'מאיה');
  await fireEvent.changeText(screen.getByLabelText('אימייל (לא חובה)'), 'bad');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת פרטים' }));
  expect(screen.getByText('יש להזין כתובת אימייל תקינה.')).toBeOnTheScreen();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('אימייל (לא חובה)'), 'maya@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירת פרטים' }));
  expect(await screen.findByText('לא הצלחנו לשמור את הפרטים. אפשר לנסות שוב.')).toBeOnTheScreen();
  expect(screen.getByLabelText('שם מלא *').props.value).toBe('מאיה');
  expect(saved).not.toHaveBeenCalled();
});

it('does not bypass a failed profile read and retries before admitting a returning customer', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValue(response({ ...profile, display_name: 'מאיה', profile_complete: true }));
  await render(provider(<ProfileGate><Text>Application</Text></ProfileGate>));
  expect(await screen.findByText('לא הצלחנו לטעון את הפרופיל.')).toBeOnTheScreen();
  expect(screen.queryByText('Application')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'ניסיון נוסף' }));
  expect(await screen.findByText('Application')).toBeOnTheScreen();
});

it('checks completion again when a different account signs in', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response({ ...profile, display_name: 'מאיה', profile_complete: true })).mockResolvedValue(response(profile));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const app = () => <QueryClientProvider client={client}><ProfileGate><Text>Application</Text></ProfileGate></QueryClientProvider>;
  const result = await render(app());
  expect(await screen.findByText('Application')).toBeOnTheScreen();
  mockSession.sessionScope = 's2';
  await result.rerender(app());
  expect(await screen.findByText('השלמת פרטים אישיים')).toBeOnTheScreen();
  expect(screen.queryByText('Application')).toBeNull();
});

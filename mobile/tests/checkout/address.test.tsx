import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CheckoutContent } from '../../app/(tabs)/(shop)/checkout';
import {
  emptyAddressForm,
  toAddressCreate,
  validateAddressForm,
} from '../../src/features/addresses/form';
import { addressesApi } from '../../src/features/addresses/api';

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: { children: unknown }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

const validAddress = {
  ...emptyAddressForm,
  building: '12',
  city: 'תל אביב',
  phone: '050-123-4567',
  recipientName: ' מאיה כהן ',
  street: ' דיזנגוף ',
};

function response(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('Israeli checkout address', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates required fields and an Israeli mobile number', () => {
    expect(validateAddressForm(emptyAddressForm)).toEqual({
      building: 'יש להזין מספר בית.',
      city: 'יש להזין עיר.',
      phone: 'יש להזין מספר טלפון ישראלי תקין.',
      recipientName: 'יש להזין שם מקבל או מקבלת.',
      street: 'יש להזין רחוב.',
    });
    expect(validateAddressForm({ ...validAddress, phone: '03-1234567' })).toEqual({
      phone: 'יש להזין מספר טלפון ישראלי תקין.',
    });
    expect(validateAddressForm(validAddress)).toEqual({});
  });

  it('trims fields, normalizes +972, and keeps optional values nullable', () => {
    expect(toAddressCreate(validAddress)).toEqual({
      apartment: null,
      building: '12',
      city: 'תל אביב',
      country: 'IL',
      is_default: false,
      phone: '+972501234567',
      postal_code: null,
      recipient_name: 'מאיה כהן',
      street: 'דיזנגוף',
    });
  });

  it('lists addresses and posts the generated contract', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: 'address-1' }, 201));

    await addressesApi.list();
    await addressesApi.create(toAddressCreate(validAddress));

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/api\/v1\/users\/me\/addresses$/),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/api\/v1\/users\/me\/addresses$/),
      expect.objectContaining({
        body: JSON.stringify(toAddressCreate(validAddress)),
        method: 'POST',
      }),
    );
  });

  it('removes an owned saved address through the address API', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({}, 204));

    await addressesApi.remove('address-1');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/users\/me\/addresses\/address-1$/),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('selects the default saved address and validates the inline form', async () => {
    const address = {
      apartment: null,
      building: '12',
      city: 'תל אביב',
      country: 'IL',
      created_at: '2026-09-03T10:00:00Z',
      id: 'address-1',
      is_default: true,
      phone_e164: '+972501234567',
      postal_code: null,
      recipient_name: 'מאיה כהן',
      street: 'דיזנגוף',
      updated_at: '2026-09-03T10:00:00Z',
    };
    globalThis.fetch = jest.fn().mockImplementation((request: string, init?: RequestInit) => {
      if (request.endsWith('/cart')) {
        return Promise.resolve(response({
            currency: 'ILS',
            expires_at: '2099-09-03T11:00:00Z',
            id: 'cart-1',
            items: [],
            last_activity_at: '2026-09-03T10:00:00Z',
            status: 'active',
            subtotal_agorot: 7250,
            total_quantity: 1,
            version: 1,
          }));
      }
      if (init?.method === 'POST') {
        return Promise.resolve(response({
          ...address,
          building: '10',
          city: 'חיפה',
          id: 'address-2',
          is_default: false,
          phone_e164: '+972507654321',
          recipient_name: 'נועה לוי',
          street: 'הרצל',
        }, 201));
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve(response({}, 204));
      }
      return Promise.resolve(response([address]));
    });
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    await render(
      <SafeAreaProvider initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 34, left: 0, right: 0, top: 44 },
      }}>
        <QueryClientProvider client={client}>
          <CheckoutContent sessionScope="session-1" />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByRole('radio', {
      checked: true,
      name: /מאיה כהן/,
    })).toBeOnTheScreen();
    expect(screen.getByText('משלוח סטנדרטי')).toBeOnTheScreen();
    expect(screen.queryByText('כרטיס אשראי מאובטח')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'חזרה לסל' }));
    expect(router.back).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'המשך לאמצעי תשלום' }));
    expect(router.push).toHaveBeenCalledWith({
      params: {
        addressId: 'address-1',
        checkoutKey: expect.stringMatching(/^mobile-checkout-/),
      },
      pathname: '/(tabs)/(shop)/payment',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'הוספת כתובת חדשה' }));
    expect(screen.getByLabelText('שם מקבל או מקבלת')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'שמירת כתובת' })).toBeDisabled();
    expect(screen.queryByRole('button', {
      name: 'המשך לאמצעי תשלום',
    })).not.toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('שם מקבל או מקבלת'), 'נועה לוי');
    await fireEvent.changeText(screen.getByLabelText('טלפון'), '050-7654321');
    await fireEvent.changeText(screen.getByLabelText('רחוב'), 'הרצל');
    await fireEvent.changeText(screen.getByLabelText('מספר בית'), '10');
    await fireEvent.changeText(screen.getByLabelText('עיר'), 'חיפה');
    expect(screen.getByRole('button', { name: 'שמירת כתובת' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'שמירת כתובת' }));
    expect(await screen.findByRole('radio', { name: /נועה לוי/ })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', {
      name: 'הסרת הכתובת של מאיה כהן',
    }));
    await waitFor(() => expect(screen.queryByRole('radio', {
      name: /מאיה כהן/,
    })).not.toBeOnTheScreen());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/users\/me\/addresses\/address-1$/),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

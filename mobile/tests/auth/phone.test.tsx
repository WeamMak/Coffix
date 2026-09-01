import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { router } from 'expo-router';

import PhoneScreen from '../../app/(auth)/phone';
import WelcomeScreen from '../../app/(auth)/welcome';
import { resolveApiBaseUrl } from '../../src/api/client';
import { formatPhoneForRtl } from '../../src/features/auth/api';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
}));

describe('phone authentication screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the normalized Israeli number before requesting a code', async () => {
    await render(<PhoneScreen />);

    await fireEvent.changeText(screen.getByLabelText('מספר טלפון'), '0542024626');

    expect(screen.getByRole('button', { name: 'חזרה' })).toHaveStyle({
      alignSelf: 'flex-start',
      borderRadius: 22,
      width: 44,
    });
    expect(screen.getByTestId('phone-row')).toHaveStyle({ direction: 'ltr' });
    expect(screen.getByLabelText('+972542024626')).toHaveStyle({
      writingDirection: 'ltr',
    });
    expect(formatPhoneForRtl('+972542024626')).toBe(
      '\u200E+972542024626\u200E',
    );
    expect(
      within(screen.getByTestId('phone-form')).getByRole('button', {
        name: 'שליחת קוד',
      }),
    ).toBeOnTheScreen();
  });

  it('requests an OTP with the normalized phone and opens code entry', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      headers: new Headers({ 'Content-Type': 'application/json' }),
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ message: 'sent' }),
    } as Response);
    globalThis.fetch = fetchMock;
    await render(<PhoneScreen />);

    await fireEvent.changeText(screen.getByLabelText('מספר טלפון'), '0501234567');
    await fireEvent.press(screen.getByRole('button', { name: 'שליחת קוד' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/otp\/request$/),
        expect.objectContaining({
          body: JSON.stringify({ phone: '+972501234567' }),
          method: 'POST',
        }),
      );
      expect(router.push).toHaveBeenCalledWith({
        params: { phone: '+972501234567' },
        pathname: '/(auth)/otp',
      });
    });
  });

  it('shows reviewed Hebrew copy without internal server details', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: new Headers({ 'X-Correlation-ID': 'corr-123' }),
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        code: 'unexpected_error',
        detail: 'Internal provider details',
        status: 500,
        title: 'Internal error',
        type: 'about:blank',
      }),
    } as Response);
    await render(<PhoneScreen />);

    await fireEvent.changeText(screen.getByLabelText('מספר טלפון'), '0501234567');
    await fireEvent.press(screen.getByRole('button', { name: 'שליחת קוד' }));

    expect(await screen.findByText('לא הצלחנו לשלוח את הקוד. נסו שוב.')).toBeOnTheScreen();
    expect(screen.queryByText(/מזהה פנייה/)).not.toBeOnTheScreen();
    expect(screen.queryByText('Internal provider details')).not.toBeOnTheScreen();
  });
});

describe('mobile API configuration', () => {
  it('uses the Android emulator host when no public API URL is configured', () => {
    expect(resolveApiBaseUrl({ platform: 'android' })).toBe('http://10.0.2.2:8000');
  });

  it('uses an explicit device-reachable API URL when configured', () => {
    expect(resolveApiBaseUrl({
      configuredUrl: 'http://192.168.1.20:8000/',
      platform: 'android',
    })).toBe('http://192.168.1.20:8000');
  });
});

describe('welcome screen', () => {
  it('offers both new and returning customers phone authentication', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText('קפה מדויק.')).toBeOnTheScreen();
    expect(screen.getByText('שירות שלם.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'התחלה' }));
    expect(router.push).toHaveBeenLastCalledWith('/(auth)/phone');

    await fireEvent.press(screen.getByRole('button', { name: /התחברות/ }));
    expect(router.push).toHaveBeenLastCalledWith('/(auth)/phone');
  });
});

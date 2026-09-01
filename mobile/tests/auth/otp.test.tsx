import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import OtpScreen from '../../app/(auth)/otp';
import { AuthSessionProvider } from '../../src/features/auth/useSession';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: () => ({ phone: '+972501234567' }),
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('OTP authentication screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances across six boxes and submits only after confirmation', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: new Headers(),
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      }),
    } as Response);
    await render(
      <AuthSessionProvider>
        <OtpScreen />
      </AuthSessionProvider>,
    );

    const boxes = screen.getAllByLabelText(/ספרה \d מתוך 6/);
    const verifyButton = screen.getByRole('button', { name: 'אימות והמשך' });
    expect(boxes).toHaveLength(6);
    expect(verifyButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'חזרה' })).toHaveStyle({
      alignSelf: 'flex-start',
      borderRadius: 22,
      height: 44,
      width: 44,
    });
    expect(screen.queryByText('›')).not.toBeOnTheScreen();

    await fireEvent.changeText(boxes[0]!, '1');
    expect(boxes[1]).toHaveStyle({
      borderColor: '#2B1810',
      borderWidth: 1.5,
    });
    expect(boxes[2]).toHaveStyle({ borderColor: '#E5DBC9' });

    for (const [index, digit] of ['2', '3', '4', '5', '6'].entries()) {
      await fireEvent.changeText(boxes[index + 1]!, digit);
    }

    expect(verifyButton).toBeEnabled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    const contentButtons = within(screen.getByTestId('otp-content')).getAllByRole('button');
    expect(contentButtons[0]).toBe(verifyButton);
    expect(contentButtons[1]).toBe(
      screen.getByRole('button', { name: 'שליחה שוב · בעוד 01:00' }),
    );

    await fireEvent.press(verifyButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/otp\/verify$/),
        expect.objectContaining({
          body: JSON.stringify({ code: '123456', phone: '+972501234567' }),
          method: 'POST',
        }),
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'coffix.accessToken',
        'access-token',
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'coffix.refreshToken',
        'refresh-token',
      );
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/(home)');
    });
  });

  it('shows an actionable invalid-code message without internal details', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: new Headers({ 'X-Correlation-ID': 'otp-correlation' }),
      ok: false,
      status: 401,
      text: async () => JSON.stringify({
        code: 'otp_invalid',
        correlationId: 'otp-correlation',
        detail: 'Internal authentication details',
        status: 401,
        title: 'Invalid or expired code',
        type: 'about:blank',
      }),
    } as Response);
    await render(
      <AuthSessionProvider>
        <OtpScreen />
      </AuthSessionProvider>,
    );

    const boxes = screen.getAllByLabelText(/ספרה \d מתוך 6/);
    for (const [index, digit] of ['1', '2', '3', '4', '5', '7'].entries()) {
      await fireEvent.changeText(boxes[index]!, digit);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'אימות והמשך' }));

    expect(await screen.findByText('הקוד שהוזן אינו נכון. נסו שוב.')).toBeOnTheScreen();
    expect(screen.queryByText(/מזהה פנייה/)).not.toBeOnTheScreen();
    expect(screen.queryByText('Internal authentication details')).not.toBeOnTheScreen();
  });

  it('enables resend after sixty seconds and starts the timer again', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockResolvedValue({
      headers: new Headers(),
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ message: 'sent' }),
    } as Response);
    await render(
      <AuthSessionProvider>
        <OtpScreen />
      </AuthSessionProvider>,
    );

    expect(screen.getByRole('button', { name: 'שליחה שוב · בעוד 01:00' })).toBeDisabled();

    for (let second = 0; second < 60; second += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    }
    const resend = screen.getByRole('button', { name: 'שליחה שוב' });
    expect(resend).toBeEnabled();
    await fireEvent.press(resend);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/auth\/otp\/request$/),
        expect.objectContaining({
          body: JSON.stringify({ phone: '+972501234567' }),
        }),
      );
      expect(screen.getByRole('button', { name: 'שליחה שוב · בעוד 01:00' })).toBeDisabled();
    });
    jest.useRealTimers();
  });
});

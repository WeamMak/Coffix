import type { components } from './generated';
import type { ApiClient } from './client';

export type AuthTokens = components['schemas']['AuthTokens'];
export type OtpRequestAccepted = components['schemas']['OtpRequestAccepted'];

export function createAuthApi(client: ApiClient) {
  return {
    logout(refreshToken: string): Promise<void> {
      return client.request('/api/v1/auth/logout', {
        authenticated: false,
        body: { refresh_token: refreshToken },
        method: 'POST',
      });
    },
    refresh(refreshToken: string): Promise<AuthTokens> {
      return client.request('/api/v1/auth/refresh', {
        authenticated: false,
        body: { refresh_token: refreshToken },
        method: 'POST',
      });
    },
    requestOtp(phone: string): Promise<OtpRequestAccepted> {
      return client.request('/api/v1/auth/otp/request', {
        authenticated: false,
        body: { phone },
        method: 'POST',
      });
    },
    verifyOtp(phone: string, code: string): Promise<AuthTokens> {
      return client.request('/api/v1/auth/otp/verify', {
        authenticated: false,
        body: { code, phone },
        method: 'POST',
      });
    },
  };
}

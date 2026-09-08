import type { ApiClient, components } from '@coffix/api-client';

export type WebSession = components['schemas']['WebSession'];
export type StaffRole = WebSession['role'];

export function createWebAuthApi(api: ApiClient) {
  const post = <T,>(path: string, body?: unknown) => api.request<T>(`/auth/web/${path}`, {
    authenticated: false, method: 'POST', body,
    headers: { 'X-CSRF-Protection': '1' },
  });
  // Tabs share the refresh cookie. Serialize cookie mutations so simultaneous
  // reloads cannot present the same token twice and trigger reuse revocation.
  const cookieCommand = async <T,>(path: string, body?: unknown): Promise<T> => {
    const send = () => post<T>(path, body);
    return globalThis.navigator?.locks
      ? await navigator.locks.request('coffix-web-session', send) : await send();
  };
  return {
    requestCode: (phone: string) => post<components['schemas']['OtpRequestAccepted']>('otp/request', { phone }),
    verifyCode: (phone: string, code: string) => cookieCommand<WebSession>('otp/verify', { phone, code }),
    refresh: () => cookieCommand<WebSession>('refresh'),
    logout: () => cookieCommand<void>('logout'),
  };
}

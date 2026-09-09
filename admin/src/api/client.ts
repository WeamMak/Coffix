import { ApiClientError, type ApiClient, type components } from '@coffix/api-client';
import { createWebAuthApi, type WebSession } from '../features/auth/api';
import { problemFrom } from './errors';
import { createQueryClient } from './queryClient';

type Snapshot = { session: WebSession | null; ready: boolean; error: unknown };

export function createWebClient(options: { baseUrl: string; fetch?: typeof fetch }) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const queryClient = createQueryClient();
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { session: null, ready: false, error: null };
  let refreshFlight: Promise<WebSession | null> | null = null;
  let signingOut = false;
  let sessionVersion = 0;

  function publish(session: WebSession | null, error: unknown = null) {
    if (snapshot.session?.user_id !== session?.user_id || snapshot.session?.role !== session?.role) {
      sessionVersion += 1;
      queryClient.clear();
    }
    snapshot = { session, ready: true, error };
    listeners.forEach((notify) => notify());
  }

  const api: ApiClient = {
    async request<T>(path: string, requestOptions: Parameters<ApiClient['request']>[1] = {}): Promise<T> {
      const authenticated = requestOptions.authenticated ?? true;
      const originalToken = snapshot.session?.access_token;
      const startedVersion = sessionVersion;
      function requireSameSession() {
        if (authenticated && startedVersion !== sessionVersion) {
          throw new ApiClientError({ type: 'about:blank', status: 409, code: 'session_changed',
            title: 'Session changed. Please try again.', correlationId: 'unknown' });
        }
      }
      async function send() {
        const token = authenticated ? snapshot.session?.access_token : null;
        return fetcher(`${options.baseUrl.replace(/\/$/, '')}${path}`, {
          method: requestOptions.method ?? 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            ...(requestOptions.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...requestOptions.headers,
          },
          body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
        });
      }
      let response = await send();
      requireSameSession();
      if (response.status === 401 && authenticated && !signingOut) {
        // A parallel request may already have refreshed the token.
        const session = snapshot.session?.access_token !== originalToken
          ? snapshot.session : await refresh();
        if (session) response = await send();
      }
      let payload: unknown;
      try { payload = response.status === 204 ? undefined : await response.json(); }
      catch { payload = undefined; }
      requireSameSession();
      if (!response.ok) {
        const error = problemFrom(response, payload);
        if (authenticated && response.status === 401) publish(null);
        throw error;
      }
      return payload as T;
    },
  };
  const auth = createWebAuthApi(api);

  function accept(session: WebSession) {
    if (!session.access_token || !session.user_id || !['admin', 'technician'].includes(session.role)) {
      throw new ApiClientError({
        type: 'about:blank', title: 'Staff access required', status: 403,
        code: 'staff_required', correlationId: 'unknown',
      });
    }
    publish(session);
    return session;
  }

  function refresh(): Promise<WebSession | null> {
    if (signingOut) return Promise.resolve(null);
    if (!refreshFlight) {
      refreshFlight = auth.refresh().then(accept).catch((error: unknown) => {
        const expired = error instanceof ApiClientError && error.problem.status === 401;
        publish(null, expired ? null : error);
        if (!expired) throw error;
        return null;
      }).finally(() => { refreshFlight = null; });
    }
    return refreshFlight;
  }

  return {
    api, queryClient,
    async uploadFile(target: components['schemas']['MediaUploadCreated'], file: File) {
      const startedVersion = sessionVersion;
      function requireSameSession() {
        if (startedVersion !== sessionVersion) throw new Error('Session changed. Please try again.');
      }
      const apiUrl = new URL(options.baseUrl, globalThis.location?.origin ?? 'http://localhost');
      const url = new URL(target.upload_url, apiUrl);
      const local = url.pathname === `${apiUrl.pathname.replace(/\/$/, '')}/media/uploads/${target.upload_id}/content`;
      // API-owned local uploads use the configured API/proxy origin. Tokens never go to a storage URL.
      const uploadUrl = local ? new URL(url.pathname, apiUrl.origin).toString() : url.toString();
      const send = () => fetcher(uploadUrl, {
        method: target.method, body: file, credentials: local ? 'include' : 'omit',
        headers: { ...target.headers, ...(local && snapshot.session ? { Authorization: `Bearer ${snapshot.session.access_token}` } : {}) },
      });
      let response = await send();
      requireSameSession();
      if (local && response.status === 401 && !signingOut && await refresh()) {
        requireSameSession();
        response = await send();
      }
      requireSameSession();
      if (!response.ok) throw problemFrom(response, await response.json().catch(() => undefined));
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    restore: () => snapshot.ready ? Promise.resolve(snapshot.session) : refresh(),
    requestCode: auth.requestCode,
    async login(phone: string, code: string) {
      if (refreshFlight) await refreshFlight.catch(() => null);
      return accept(await auth.verifyCode(phone, code));
    },
    async logout() {
      signingOut = true;
      try {
        if (refreshFlight) await refreshFlight.catch(() => null);
        await auth.logout();
        queryClient.clear();
        publish(null);
      } finally { signingOut = false; }
    },
  };
}

export type WebClient = ReturnType<typeof createWebClient>;

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { queryClient } from '../../api/queryClient';
import { authApi } from './api';
import { secureTokenStore } from './store';

export type SessionStatus = 'authenticated' | 'loading' | 'unauthenticated';

type SessionContextValue = {
  logout(): Promise<void>;
  sessionScope: string | null;
  signIn(phone: string, code: string): Promise<void>;
  status: SessionStatus;
};

const SessionContext = createContext<SessionContextValue | null>(null);
type SessionRestore = {
  sessionScope: string | null;
  status: SessionStatus;
};

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let bootRefreshPromise: Promise<SessionRestore> | null = null;

function sessionScopeFrom(refreshToken: string): string | null {
  const [sessionId] = refreshToken.split('.', 1);
  return sessionId && SESSION_ID_PATTERN.test(sessionId) ? sessionId : null;
}

async function refreshStoredSession(): Promise<SessionRestore> {
  let refreshToken: string | null;
  try {
    refreshToken = await secureTokenStore.getRefreshToken();
  } catch {
    return { sessionScope: null, status: 'unauthenticated' };
  }
  if (!refreshToken) {
    return { sessionScope: null, status: 'unauthenticated' };
  }

  try {
    const tokens = await authApi.refresh(refreshToken);
    await secureTokenStore.setTokens(tokens);
    return {
      sessionScope: sessionScopeFrom(tokens.refresh_token),
      status: 'authenticated',
    };
  } catch {
    await secureTokenStore.clear();
    return { sessionScope: null, status: 'unauthenticated' };
  }
}

function restoreSessionOnce(): Promise<SessionRestore> {
  if (!bootRefreshPromise) {
    const refresh = refreshStoredSession();
    bootRefreshPromise = refresh;
    void refresh.finally(() => {
      if (bootRefreshPromise === refresh) {
        bootRefreshPromise = null;
      }
    });
  }

  return bootRefreshPromise;
}

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [sessionScope, setSessionScope] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => secureTokenStore.subscribeToClear(() => {
    queryClient.clear();
    setSessionScope(null);
    setStatus('unauthenticated');
  }), []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const restoredStatus = await restoreSessionOnce();
      if (active) {
        setSessionScope(restoredStatus.sessionScope);
        setStatus(restoredStatus.status);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    async logout() {
      const refreshToken = await secureTokenStore.getRefreshToken();
      try {
        if (refreshToken) {
          await authApi.logout(refreshToken);
        }
      } finally {
        await secureTokenStore.clear();
      }
    },
    async signIn(phone: string, code: string) {
      const tokens = await authApi.verifyOtp(phone, code);
      await secureTokenStore.setTokens(tokens);
      setSessionScope(sessionScopeFrom(tokens.refresh_token));
      setStatus('authenticated');
    },
    sessionScope,
    status,
  }), [sessionScope, status]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside AuthSessionProvider');
  }
  return value;
}

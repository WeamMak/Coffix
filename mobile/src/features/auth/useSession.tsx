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
  signIn(phone: string, code: string): Promise<void>;
  status: SessionStatus;
};

const SessionContext = createContext<SessionContextValue | null>(null);
let bootRefreshPromise: Promise<SessionStatus> | null = null;

async function refreshStoredSession(): Promise<SessionStatus> {
  const refreshToken = await secureTokenStore.getRefreshToken();
  if (!refreshToken) {
    return 'unauthenticated';
  }

  try {
    const tokens = await authApi.refresh(refreshToken);
    await secureTokenStore.setTokens(tokens);
    return 'authenticated';
  } catch {
    await secureTokenStore.clear();
    return 'unauthenticated';
  }
}

function restoreSessionOnce(): Promise<SessionStatus> {
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
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => secureTokenStore.subscribeToClear(() => {
    queryClient.clear();
    setStatus('unauthenticated');
  }), []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const restoredStatus = await restoreSessionOnce();
      if (active) {
        setStatus(restoredStatus);
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
      setStatus('authenticated');
    },
    status,
  }), [status]);

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

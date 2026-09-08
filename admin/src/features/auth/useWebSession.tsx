import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WebClient } from '../../api/client';

const WebClientContext = createContext<WebClient | null>(null);

export function WebSessionProvider({ client, children }: { client: WebClient; children: ReactNode }) {
  useEffect(() => { void client.restore().catch(() => undefined); }, [client]);
  return (
    <WebClientContext.Provider value={client}>
      <QueryClientProvider client={client.queryClient}>{children}</QueryClientProvider>
    </WebClientContext.Provider>
  );
}

export function useWebSession() {
  const client = useContext(WebClientContext);
  if (!client) throw new Error('WebSessionProvider is required');
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return { ...snapshot, client };
}

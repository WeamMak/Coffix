import type { QueryClient } from '@tanstack/react-query';
import { notificationsApi } from './api';
import { notificationIdFrom } from './navigation';

export type PushState = 'loading' | 'ready' | 'denied' | 'unavailable' | 'error';
export interface PushDevice {
  platform: 'android' | 'ios';
  permission(): Promise<boolean>;
  token(): Promise<string>;
  deleteToken(): Promise<void>;
  subscribe(message: (data: unknown, opened: boolean) => void, rotated: (token: string) => void): () => void;
  initial(): Promise<unknown>;
}
type Options = {
  scope: string; device: PushDevice; client: QueryClient;
  getAccessToken(): Promise<string | null>;
  onOpen(id: string): void;
  onState(state: PushState): void;
};
export function createPushSession({ scope, device, client, getAccessToken, onOpen, onState }: Options) {
  let stopped = false;
  let unsubscribe = () => {};
  let pending = Promise.resolve();
  let tokenRequest: Promise<string> | null = null;
  let registered: { id: string; access: string; token: string } | null = null;
  const received = new Set<string>();
  const opened = new Set<string>();
  const remember = (set: Set<string>, id: string) => { set.add(id); if (set.size > 200) set.delete(set.values().next().value!); };
  const message = (data: unknown, tapped: boolean) => {
    if (stopped) return;
    const id = notificationIdFrom(data);
    if (!id) return;
    if (!received.has(id)) {
      remember(received, id);
      // An authenticated refresh is the only source of notification/entity state.
      void client.invalidateQueries({ queryKey: ['private', scope] });
    }
    if (tapped && !opened.has(id)) { remember(opened, id); onOpen(id); }
  };
  const register = (token: string) => {
    pending = pending.then(async () => {
      if (stopped || registered?.token === token) return;
      if (!token.trim() || token.length > 512) throw new Error('Invalid device token');
      const access = await getAccessToken();
      if (stopped || !access) return;
      const result = await notificationsApi.register(token, device.platform, access);
      const previous = registered;
      registered = { id: result.id, access, token };
      if (previous && previous.id !== result.id) await notificationsApi.deactivate(previous.id, previous.access);
      if (!result.is_active) throw new Error('Device rejected');
      if (!stopped) onState('ready');
    }).catch(() => { if (!stopped) onState('error'); });
    return pending;
  };
  return {
    async start() {
      try {
        onState('loading');
        const granted = await device.permission();
        if (stopped) return;
        if (!granted) { onState('denied'); return; }
        unsubscribe = device.subscribe(message, token => { void register(token); });
        tokenRequest = device.token();
        const token = await tokenRequest;
        if (stopped) return;
        await register(token);
        if (!stopped) message(await device.initial(), true);
      } catch { if (!stopped) onState('error'); }
    },
    async stop() {
      if (stopped) return;
      stopped = true; unsubscribe(); received.clear(); opened.clear();
      await tokenRequest?.catch(() => {});
      await pending;
      try { if (registered) await notificationsApi.deactivate(registered.id, registered.access); }
      finally { await device.deleteToken(); }
    },
  };
}

// Session cleanup is awaited before revoking credentials or accepting another
// login. All callbacks are stopped synchronously, including late OS callbacks.
let cleanup: (() => Promise<void>) | null = null;
export function bindPushCleanup(stop: () => Promise<void>) {
  cleanup = stop;
  return () => { if (cleanup === stop) cleanup = null; };
}
export async function stopPushSession() {
  const stop = cleanup;
  cleanup = null;
  if (stop) await stop();
}

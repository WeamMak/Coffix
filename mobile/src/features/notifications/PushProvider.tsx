import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { Button } from '../../components/Button';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme';
import { secureTokenStore } from '../auth/store';
import { useSession } from '../auth/useSession';
import { loadPushDevice } from './nativePush';
import { notificationDestination } from './navigation';
import { bindPushCleanup, createPushSession, type PushState } from './push';

const PushContext = createContext<{ state: PushState; retry(): void }>({ state: 'unavailable', retry() {} });
export function PushProvider({ children }: PropsWithChildren) {
  const { sessionScope, status } = useSession();
  const client = useQueryClient();
  const [state, setState] = useState<PushState>('loading');
  const [attempt, setAttempt] = useState(0);
  const transition = useRef(Promise.resolve());
  useEffect(() => {
    if (status !== 'authenticated' || !sessionScope) return;
    let active = true;
    let session: ReturnType<typeof createPushSession> | null = null;
    let unbind = () => {};
    let stopPromise: Promise<void> | null = null;
    const stop = () => {
      active = false;
      stopPromise ??= session?.stop().catch(() => {}) ?? Promise.resolve();
      return stopPromise;
    };
    // Serialize native token deletion with the next session's registration.
    const initialize = transition.current.then(async () => {
      if (!active) return;
      try {
        const device = await loadPushDevice();
        if (!active) return;
        if (!device) { setState('unavailable'); return; }
        session = createPushSession({ scope: sessionScope, device, client,
          getAccessToken: () => secureTokenStore.getAccessToken(),
          onState: value => { if (active) setState(value); },
          onOpen: id => {
            void notificationDestination(id).then(destination => {
              if (active) router.push(destination ?? '/notifications');
            }).catch(() => { if (active) router.push('/notifications'); });
          },
        });
        unbind = bindPushCleanup(stop);
        void session.start();
      } catch { if (active) setState('unavailable'); }
    });
    const appState = AppState.addEventListener('change', value => {
      if (value === 'active' && active) {
        void client.invalidateQueries({ queryKey: ['private', sessionScope] });
        setAttempt(current => current + 1);
      }
    });
    return () => {
      void stop(); unbind(); appState.remove();
      transition.current = initialize.then(stop);
    };
  }, [attempt, client, sessionScope, status]);
  return <PushContext.Provider value={{ state, retry: () => setAttempt(value => value + 1) }}>{children}</PushContext.Provider>;
}
export function PushPermissionState({ showStatus = false, showSettingsAction = true }: { showStatus?: boolean; showSettingsAction?: boolean } = {}) {
  const { state, retry } = useContext(PushContext);
  if (state === 'ready' || state === 'loading') return showStatus ? <Text accessibilityLiveRegion="polite">{state === 'ready' ? 'התראות במכשיר פעילות.' : 'בודקים הרשאת התראות…'}</Text> : null;
  return <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
    <Text color={colors.ink2} accessibilityLiveRegion="polite">{state === 'denied'
      ? 'ההתראות חסומות בהגדרות המכשיר. כדי לקבל עדכונים בזמן, אפשר לאפשר התראות בהגדרות. כל העדכונים נשמרים כאן.'
      : state === 'unavailable' ? 'התראות למכשיר אינן זמינות בגרסה זו. כל העדכונים זמינים כאן באפליקציה.'
        : 'לא הצלחנו לחבר התראות למכשיר. כל העדכונים זמינים כאן ואפשר לנסות שוב.'}</Text>
    {state === 'denied' && showSettingsAction ? <Button size="small" tone="soft" onPress={() => { void Linking.openSettings().catch(() => {}); }}>פתיחת הגדרות המכשיר</Button>
      : state === 'error' ? <Button size="small" tone="soft" onPress={retry}>חיבור התראות מחדש</Button> : null}
  </View>;
}

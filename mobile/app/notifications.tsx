import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { BackButton } from '../src/components/BackButton';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { useSession } from '../src/features/auth/useSession';
import { notificationsApi } from '../src/features/notifications/api';
import { notificationDestination } from '../src/features/notifications/navigation';
import { refreshNotifications, useNotifications } from '../src/features/notifications/queries';
import { PushPermissionState } from '../src/features/notifications/PushProvider';
import { useRefetchOnFocus } from '../src/features/orders/queries';
import { goBack } from '../src/navigation/goBack';
import { colors, radii, spacing } from '../src/theme';

export function NotificationsContent({ sessionScope }: { sessionScope: string }) {
  const query = useNotifications(sessionScope);
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useRefetchOnFocus(query.refetch);
  const items = [...new Map(query.data?.pages.flat().map(item => [item.id, item])).values()];
  const perform = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch { if (active.current) setError('לא ניתן לפתוח את העדכון כרגע. נסו שוב.'); }
    finally {
      if (active.current) { await refreshNotifications(client, sessionScope); setBusy(false); }
      locked.current = false;
    }
  };
  return <Screen contentContainerStyle={styles.screen} header={<View style={styles.header}>
    <BackButton onPress={() => goBack('/(tabs)/(profile)')} />
    <Text accessibilityRole="header" variant="screenTitle" style={{ flex: 1 }}>התראות</Text>
  </View>}>
    <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); void refreshNotifications(client, sessionScope); }}
      ListHeaderComponent={<View style={{ gap: spacing.md }}><PushPermissionState />
        {items.some(item => !item.read_at) ? <Button size="small" tone="soft" disabled={busy} onPress={() => void perform(async () => {
          // Walk the full inbox; read mutations do not change its stable ordering.
          let offset = 0;
          for (;;) {
            const page = await notificationsApi.list(offset);
            for (const item of page) { if (!active.current) return; if (!item.read_at) await notificationsApi.read(item.id); }
            if (page.length < 50) break;
            offset += 50;
          }
        })}>סמן הכל כנקרא</Button> : null}
        {error ? <Text accessibilityRole="alert" color={colors.accentDeep}>{error}</Text> : null}
        {query.isError ? <><Text>לא הצלחנו לטעון התראות.</Text><Button onPress={() => void query.refetch()}>ניסיון נוסף</Button></> : null}
      </View>}
      ListEmptyComponent={query.isPending ? <ActivityIndicator accessibilityLabel="טוענים התראות" /> : !query.isError ? <Text>אין התראות חדשות. עדכונים על הזמנות ושירות יופיעו כאן.</Text> : null}
      ListFooterComponent={query.hasNextPage ? <Button tone="soft" disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>התראות נוספות</Button> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title_he}. ${item.body_he}. ${item.read_at ? 'נקראה' : 'לא נקראה'}`} disabled={busy} accessibilityState={{ disabled: busy }}
        onPress={() => void perform(async () => { const destination = await notificationDestination(item.id); if (active.current && destination) router.push(destination); })}
        style={[styles.item, !item.read_at ? styles.unread : null]}>
        <View style={[styles.icon, { backgroundColor: item.read_at ? colors.chip : colors.accent }, item.related_entity_type !== 'order' && item.related_entity_type !== 'service_request' ? { borderRadius: 19 } : null]}><Feather name={item.related_entity_type === 'order' ? 'truck' : item.related_entity_type === 'service_request' ? 'tool' : 'bell'} size={18} color={item.read_at ? colors.ink : colors.white} /></View>
        <View style={{ flex: 1, gap: spacing.xs }}><Text variant="sectionTitle">{item.title_he}</Text><Text color={colors.ink2}>{item.body_he}</Text><Text variant="caption" color={colors.ink2}>{new Date(item.created_at).toLocaleString('he-IL')}</Text></View>
        {!item.read_at ? <View style={styles.dot} /> : null}
      </Pressable>}
    />
  </Screen>;
}
export default function NotificationsRoute() {
  const { status, sessionScope } = useSession();
  if (status === 'loading') return <Screen><ActivityIndicator /></Screen>;
  if (status !== 'authenticated' || !sessionScope) return <Redirect href="/(auth)" />;
  return <NotificationsContent key={sessionScope} sessionScope={sessionScope} />;
}
const styles = StyleSheet.create({
  screen: { flex: 1, direction: 'rtl' }, header: { direction: 'rtl', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  list: { gap: spacing.sm, paddingBottom: spacing.xl }, item: { direction: 'rtl', flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  unread: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 5 },
});

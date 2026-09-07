import Feather from '@expo/vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { type ComponentProps, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { NotificationButton } from '../../../src/components/NotificationButton';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { formatPhoneForRtl } from '../../../src/features/auth/api';
import { machinesApi } from '../../../src/features/machines/api';
import { useOrders, useRefetchOnFocus } from '../../../src/features/orders/queries';
import { profileApi } from '../../../src/features/profile/api';
import { colors, radii, spacing } from '../../../src/theme';

const rows: { label: string; icon: ComponentProps<typeof Feather>['name']; href: Href }[] = [
  { label: 'כתובות', icon: 'map-pin', href: '/(tabs)/(profile)/addresses' },
  { label: 'ההזמנות שלי', icon: 'shopping-bag', href: '/(tabs)/(orders)' },
  { label: 'המכונות ובקשות השירות שלי', icon: 'tool', href: '/(tabs)/(service)' },
  { label: 'התראות', icon: 'bell', href: '/notifications' },
];
export function ProfileContent({ sessionScope, logout }: { sessionScope: string; logout(): Promise<void> }) {
  const profile = useQuery({ queryKey: ['private', sessionScope, 'profile'], queryFn: profileApi.get });
  const machines = useQuery({ queryKey: ['private', sessionScope, 'machines', 'list'], queryFn: machinesApi.list });
  const orders = useOrders(sessionScope);
  useRefetchOnFocus(profile.refetch);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Screen scroll contentContainerStyle={styles.screen} header={<View style={styles.header}>
    <Text accessibilityRole="header" variant="screenTitle" style={{ flex: 1 }}>הפרופיל שלי</Text><NotificationButton sessionScope={sessionScope} />
  </View>}>
    {profile.isPending ? <ActivityIndicator accessibilityLabel="טוענים פרופיל" /> : profile.isError ? <><Text>לא הצלחנו לטעון את הפרופיל.</Text><Button onPress={() => void profile.refetch()}>ניסיון נוסף</Button></> : <View style={styles.profile}>
      <View style={styles.identity}><View style={styles.avatar}><Text align="center" color={colors.white} variant="screenTitle">{profile.data.display_name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('.') || <Feather name="user" size={26} />}</Text></View>
        <View style={{ flex: 1, gap: spacing.sm }}><Text variant="sectionTitle" color={colors.cream}>{profile.data.display_name || 'החשבון שלי'}</Text><Text color={colors.cream}>{formatPhoneForRtl(profile.data.phone_e164)}</Text></View>
      </View>
      <View style={styles.stats}>
        <View style={{ flex: 1 }}><Text color={colors.cream} variant="screenTitle">{orders.data?.length ?? '—'}</Text><Text color={colors.cream} variant="caption">הזמנות</Text></View>
        <View style={{ flex: 1 }}><Text color={colors.cream} variant="screenTitle">{machines.data?.length ?? '—'}</Text><Text color={colors.cream} variant="caption">מכונות</Text></View>
      </View>
    </View>}
    <Text color={colors.ink2} variant="eyebrow">החשבון שלי</Text>
    <View style={styles.group}>{rows.slice(0, 1).map(row => <ProfileRow key={row.label} {...row} />)}</View>
    <Text color={colors.ink2} variant="eyebrow">הפעילות שלי</Text>
    <View style={styles.group}>{rows.slice(1).map(row => <ProfileRow key={row.label} {...row} />)}</View>
    {confirm ? <View style={{ gap: spacing.md }}><Text>לצאת מהחשבון? טיוטות בקשות השירות יימחקו מהמכשיר.</Text><Button disabled={busy} onPress={() => {
      setBusy(true); setError(''); void logout().catch(() => { setError('היציאה מהמכשיר הושלמה. אם אין חיבור, ניתוק ההתראות עלול להתעכב.'); }).finally(() => setBusy(false));
    }}>אישור יציאה</Button><Button disabled={busy} tone="soft" onPress={() => setConfirm(false)}>ביטול</Button></View> : <Button tone="soft" onPress={() => setConfirm(true)}>יציאה</Button>}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </Screen>;
}
function ProfileRow({ label, icon, href }: typeof rows[number]) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} style={styles.row}>
    <View style={styles.rowIcon}><Feather name={icon} size={18} color={colors.ink} /></View><Text style={{ flex: 1 }}>{label}</Text><Feather name="chevron-left" size={18} color={colors.ink2} />
  </Pressable>;
}
export default function ProfileRoute() {
  const { sessionScope, logout } = useSession();
  return <ProfileContent key={sessionScope} sessionScope={sessionScope ?? ''} logout={logout} />;
}
const styles = StyleSheet.create({
  screen: { gap: spacing.lg, paddingBottom: spacing.xl, direction: 'rtl' }, header: { direction: 'rtl', flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.xl },
  profile: { padding: 22, borderRadius: 22, backgroundColor: colors.ink, gap: 18 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 14 }, avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.ink2, paddingTop: spacing.lg }, group: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, minHeight: 60 }, rowIcon: { backgroundColor: colors.chip, width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});

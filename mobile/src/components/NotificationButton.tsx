import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useUnreadNotifications } from '../features/notifications/queries';
import { colors } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

export function NotificationButton({ sessionScope }: { sessionScope: string }) {
  const unread = useUnreadNotifications(sessionScope);
  const count = unread.data?.unread_count ?? 0;
  return <IconButton style={{ width: 44, height: 44, borderRadius: 22 }} accessibilityLabel={`התראות, ${count} לא נקראו`} onPress={() => router.push('/notifications')} icon={
    <View><Feather name="bell" size={20} color={colors.ink} />{count > 0 ? <View style={styles.badge}><Text variant="caption" color={colors.white} align="center">{count > 99 ? '99+' : count}</Text></View> : null}</View>
  } />;
}
const styles = StyleSheet.create({ badge: { backgroundColor: colors.accentDeep, borderRadius: 12, minWidth: 18, paddingHorizontal: 3, position: 'absolute', top: -12, end: -12 } });

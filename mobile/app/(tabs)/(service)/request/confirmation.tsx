import { router, type Href, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ErrorState } from '../../../../src/components/ErrorState';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { useServiceRequest } from '../../../../src/features/service/queries';
import { colors, spacing } from '../../../../src/theme';

export function ServiceConfirmationContent({ requestId, sessionScope }: { requestId: string; sessionScope: string }) {
  const query = useServiceRequest(sessionScope, requestId);
  if (query.isPending) return <Screen><Text>בודקים את הבקשה</Text></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message="לא הצלחנו לאמת את הבקשה" onRetry={() => void query.refetch()} /></Screen>;
  const request = query.data;
  return <Screen scroll contentContainerStyle={styles.page}>
    <View style={styles.content}>
      <View style={styles.symbol}><Feather name="tool" size={32} color={colors.cream} /></View>
      <View style={{ gap: spacing.sm }}>
        <Text variant="display" align="center" style={{ fontSize: 30 }}>הבקשה התקבלה.</Text>
        <Text align="center" color={colors.ink2}>נבחן את הבקשה ונשלח אליכם הצעה עם אגרת אבחון.</Text>
      </View>
      <Card style={{ gap: spacing.md, padding: spacing.xl }}>
        <View style={styles.row}><Text variant="eyebrow" color={colors.ink3}>מספר בקשה</Text><Text variant="sectionTitle">{request.reference}</Text></View>
        <View style={styles.row}><Text variant="eyebrow" color={colors.ink3}>מענה צפוי</Text><Text>תוך {request.response_hours} שעות</Text></View>
      </Card>
      <Button onPress={() => router.replace(`/(tabs)/(service)/requests/${requestId}` as Href)}>מעקב אחרי הבקשה</Button>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/(service)' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text align="center" color={colors.ink2}>חזרה למכונות שלי</Text>
      </Pressable>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  page: { justifyContent: 'center', paddingVertical: spacing['2xl'] },
  content: { gap: spacing.xl },
  symbol: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.accent, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  row: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
export default function ConfirmationScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { sessionScope } = useSession();
  return <ServiceConfirmationContent requestId={requestId ?? ''} sessionScope={sessionScope ?? ''} />;
}

import { router, type Href, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ErrorState } from '../../../../src/components/ErrorState';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { formatIls } from '../../../../src/features/catalog/types';
import { useServiceRequest } from '../../../../src/features/service/queries';
import { NON_REFUNDABLE_COPY, PREFERRED_WINDOW_COPY } from '../../../../src/features/service/status';
import { colors, spacing } from '../../../../src/theme';

export function ServiceConfirmationContent({ requestId, sessionScope }: { requestId: string; sessionScope: string }) {
  const query = useServiceRequest(sessionScope, requestId);
  if (query.isPending) return <Screen><Text>בודקים את הבקשה</Text></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message="לא הצלחנו לאמת את הבקשה" onRetry={() => void query.refetch()} /></Screen>;
  const request = query.data;
  return <Screen scroll contentContainerStyle={{ gap: spacing.xl, paddingVertical: spacing.xl }}>
    <Feather name="check-circle" size={56} color={colors.sage} />
    <Text variant="display">הבקשה נשלחה!</Text><Text variant="sectionTitle">{request.reference}</Text>
    <Card style={{ gap: spacing.md }}>
      <Text>{request.service_type_label_he}</Text>
      <Text variant="sectionTitle">דמי האבחון שנקבעו: {formatIls(request.diagnostic_fee_agorot)}</Text>
      <Text>{NON_REFUNDABLE_COPY}</Text><Text>{PREFERRED_WINDOW_COPY}</Text>
    </Card>
    <Button onPress={() => router.replace(`/(tabs)/(service)/requests/${requestId}` as Href)}>לפרטי הבקשה ולתשלום</Button>
    <Button tone="soft" onPress={() => router.replace('/(tabs)/(service)' as Href)}>למכונות שלי</Button>
  </Screen>;
}
export default function ConfirmationScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { sessionScope } = useSession();
  return <ServiceConfirmationContent requestId={requestId ?? ''} sessionScope={sessionScope ?? ''} />;
}

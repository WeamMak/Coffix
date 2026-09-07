import { useLocalSearchParams } from 'expo-router';
import { useSession } from '../../../../../src/features/auth/useSession';
import { usePaymentConfirmer } from '../../../../../src/features/payments/usePayment';
import { ServicePaymentContent } from '../../../../../src/features/service/ServicePaymentScreen';

export default function ServicePaymentScreen() {
  const { requestId, kind } = useLocalSearchParams<{ requestId: string; kind: string }>();
  const { sessionScope } = useSession();
  const confirmer = usePaymentConfirmer();
  return <ServicePaymentContent key={`${sessionScope}-${requestId}-${kind}`} requestId={requestId ?? ''} sessionScope={sessionScope ?? ''} kind={kind === 'additional' ? 'additional' : 'diagnostic'} confirmer={confirmer} />;
}

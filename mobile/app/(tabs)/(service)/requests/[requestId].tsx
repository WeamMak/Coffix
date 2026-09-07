import Feather from '@expo/vector-icons/Feather';
import { IconButton } from '../../../../src/components/IconButton';
import { BackButton } from '../../../../src/components/BackButton';
import { goBack } from '../../../../src/navigation/goBack';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ErrorState } from '../../../../src/components/ErrorState';
import { MediaGrid } from '../../../../src/components/MediaGrid';
import { QuoteCard } from '../../../../src/components/QuoteCard';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { secureTokenStore } from '../../../../src/features/auth/store';
import { useSession } from '../../../../src/features/auth/useSession';
import { formatIls } from '../../../../src/features/catalog/types';
import { formatDateTime } from '../../../../src/features/machines/warranty';
import { machineKeys, useRefetchOnFocus } from '../../../../src/features/machines/queries';
import { serviceApi, type ServiceRequest } from '../../../../src/features/service/api';
import { serviceKeys, useServiceRequest } from '../../../../src/features/service/queries';
import { NON_REFUNDABLE_COPY } from '../../../../src/features/service/status';
import { ServiceProgress } from '../../../../src/features/service/ServiceProgress';
import { ServiceRequestSummary } from '../../../../src/features/service/ServiceRequestSummary';
import { spacing, colors } from '../../../../src/theme';

export function ServiceDetailContent({ requestId, sessionScope }: { requestId: string; sessionScope: string }) {
  const query = useServiceRequest(sessionScope, requestId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const unsubscribe = secureTokenStore.subscribeToClear(() => { active.current = false; });
    return () => { active.current = false; unsubscribe(); };
  }, []);
  const [message, setMessage] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  useRefetchOnFocus(query.refetch);
  const request = query.data;
  const store = (updated: ServiceRequest) => {
    if (!active.current) return;
    client.setQueryData(serviceKeys.detail(sessionScope, requestId), updated);
    void client.invalidateQueries({ queryKey: machineKeys.detail(sessionScope, updated.machine_id) });
    void client.invalidateQueries({ queryKey: serviceKeys.list(sessionScope) });
  };
  const run = async (operation: () => Promise<ServiceRequest>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try { store(await operation()); }
    catch {
      setMessage('לא הצלחנו לאשר את הפעולה. בודקים את מצב הבקשה לפני ניסיון נוסף.');
      await query.refetch();
    } finally { inFlight.current = false; if (active.current) { setBusy(false); setCancelConfirm(false); } }
  };
  const header = <View><View style={{ direction: 'rtl', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
    <BackButton onPress={() => goBack('/(tabs)/(service)' as Href)} />
    <View style={{ flex: 1 }}><Text align="start" variant="eyebrow" color={colors.ink3}>בקשת שירות</Text><Text align="start" variant="sectionTitle">{request?.reference ?? ''}</Text></View>
    <IconButton accessibilityLabel="פעולות בקשה" accessibilityState={{ expanded: actionsOpen }} icon={<Feather name="more-horizontal" size={20} color={colors.ink} />} style={{ borderRadius: 22, width: 44, height: 44 }} onPress={() => setActionsOpen(open => !open)} />
  </View>{actionsOpen ? <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}><Button tone="soft" disabled={query.isFetching} onPress={() => { setActionsOpen(false); void query.refetch(); }}>רענון הבקשה</Button></View> : null}</View>;
  if (query.isPending) return <Screen header={header}><Text align="start">טוענים בקשת שירות</Text></Screen>;
  if (query.isError || !request) return <Screen header={header}><ErrorState message="לא הצלחנו לטעון את בקשת השירות" onRetry={() => void query.refetch()} /></Screen>;
  const allowed = (action: string) => !query.isRefetchError && request.allowed_actions.includes(action);
  const paymentKind = allowed('pay_diagnostic') ? 'diagnostic' : allowed('pay_additional') || allowed('accept_quote') ? 'additional' : null;
  const canReject = Boolean(paymentKind && (allowed('cancel') || allowed('decline_quote')));
  const openPayment = async () => {
    if (inFlight.current || !paymentKind) return;
    inFlight.current = true; setBusy(true);
    try {
      if (allowed('accept_quote')) store(await serviceApi.decide(requestId, 'accepted'));
      if (active.current) router.push({ pathname: '/(tabs)/(service)/requests/[requestId]/payment', params: { requestId, kind: paymentKind } } as Href);
    } catch {
      if (active.current) setMessage('לא הצלחנו לאשר את ההצעה. יש לרענן ולנסות שוב.');
      await query.refetch();
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  };
  const amount = paymentKind === 'diagnostic' ? request.diagnostic_fee_agorot : request.quotes.at(-1)?.amount_agorot;
  return <Screen header={header} scroll contentContainerStyle={{ gap: spacing.xl, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
    {paymentKind && amount != null ? <Card testID="service-payment-card" style={{ backgroundColor: colors.ink, borderColor: colors.ink, borderRadius: 22, padding: spacing.xl, gap: spacing.md }}>
      <Text align="start" color={colors.accent} variant="eyebrow">ממתין לתשלום</Text>
      <Text align="start" color={colors.cream} variant="screenTitle">{paymentKind === 'diagnostic' ? 'אגרת אבחון' : 'תשלום נוסף'} — {formatIls(amount)}</Text>
      <Text align="start" color={colors.cream}>{paymentKind === 'diagnostic' ? 'הצוות סקר את הבקשה. אגרת האבחון מכסה פירוק ובדיקה. עלויות חלפים יצאו לאישור בנפרד.' : request.quotes.at(-1)?.explanation}</Text>
      <Text align="start" color={colors.ink3} variant="caption">{NON_REFUNDABLE_COPY}</Text>
      <View style={{ direction: 'rtl', flexDirection: 'row', gap: spacing.sm }}>
        <Button tone="accent" style={{ flex: 1 }} disabled={busy} accessibilityLabel={paymentKind === 'diagnostic' ? 'תשלום דמי אבחון' : 'תשלום נוסף'} onPress={() => void openPayment()}>תשלום ואישור</Button>
        {canReject ? <Button accessibilityLabel="ביטול בקשה" disabled={busy} style={{ borderWidth: 1, borderColor: colors.ink3 }} onPress={() => setCancelConfirm(true)}>ביטול</Button> : null}
      </View>
    </Card> : null}
    {cancelConfirm && canReject ? <Card style={{ gap: spacing.sm }}>
      <Text align="start">ביטול ההצעה יבטל את בקשת השירות כולה. תשלומים שכבר שולמו אינם מוחזרים.</Text>
      <Button disabled={busy} onPress={() => void run(() => allowed('decline_quote') ? serviceApi.decide(requestId, 'declined') : serviceApi.cancel(requestId))}>אישור ביטול הבקשה</Button>
      <Button disabled={busy} tone="soft" onPress={() => setCancelConfirm(false)}>חזרה</Button>
    </Card> : null}
    {message ? <Text align="start" accessibilityLiveRegion="polite">{message}</Text> : null}
    <ServiceProgress request={request} />
    <ServiceRequestSummary request={request} sessionScope={sessionScope} />
    <QuoteCard request={request} />
    <View style={{ gap: spacing.sm }}><Text align="start" variant="caption" color={colors.ink3}>פרטי התקלה</Text><Text align="start">{request.description}</Text></View>
    {request.media.some(item => item.purpose === 'issue') ? <MediaGrid scope={sessionScope} items={request.media.filter(item => item.purpose === 'issue').map(item => ({ id: item.media_id, uri: '', contentType: '' }))} /> : null}
    {request.notes.map(note => <Card key={note.id}><Text align="start">{note.body}</Text><Text align="start" variant="caption">{formatDateTime(note.created_at)}</Text></Card>)}
  </Screen>;
}

export default function ServiceDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { sessionScope } = useSession();
  return <ServiceDetailContent key={`${sessionScope}-${requestId}`} requestId={requestId ?? ''} sessionScope={sessionScope ?? ''} />;
}

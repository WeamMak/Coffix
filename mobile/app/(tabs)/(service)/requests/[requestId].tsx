import { BackButton } from '../../../../src/components/BackButton';
import { goBack } from '../../../../src/navigation/goBack';
import { type Href, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { AppointmentCard } from '../../../../src/components/AppointmentCard';
import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ErrorState } from '../../../../src/components/ErrorState';
import { MediaGrid } from '../../../../src/components/MediaGrid';
import { QuoteCard } from '../../../../src/components/QuoteCard';
import { Screen } from '../../../../src/components/Screen';
import { StatusTimeline } from '../../../../src/components/StatusTimeline';
import { Text } from '../../../../src/components/Text';
import { secureTokenStore } from '../../../../src/features/auth/store';
import { useSession } from '../../../../src/features/auth/useSession';
import { formatIls } from '../../../../src/features/catalog/types';
import { formatDateTime } from '../../../../src/features/machines/warranty';
import { machineKeys, useRefetchOnFocus } from '../../../../src/features/machines/queries';
import { usePaymentConfirmer, type PaymentConfirmer } from '../../../../src/features/payments/usePayment';
import { serviceApi, type ServiceRequest } from '../../../../src/features/service/api';
import { serviceKeys, useServiceRequest } from '../../../../src/features/service/queries';
import { payForService } from '../../../../src/features/service/payments';
import { NON_REFUNDABLE_COPY, serviceStatusLabels, serviceTimeline } from '../../../../src/features/service/status';
import { spacing, colors } from '../../../../src/theme';

export function ServiceDetailContent({ requestId, sessionScope, confirmer }: { requestId: string; sessionScope: string; confirmer: PaymentConfirmer }) {
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
  const back = <View style={{ direction: 'rtl' }}><BackButton onPress={() => goBack('/(tabs)/(service)' as Href)} style={{ alignSelf: 'flex-start' }} /></View>;
  if (query.isPending) return <Screen>{back}<Text>טוענים בקשת שירות</Text></Screen>;
  if (query.isError || !request) return <Screen>{back}<ErrorState message="לא הצלחנו לטעון את בקשת השירות" onRetry={() => void query.refetch()} /></Screen>;
  const allowed = (action: string) => !query.isRefetchError && request.allowed_actions.includes(action);
  return <Screen scroll contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.lg }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
    {back}
    <Card style={{ backgroundColor: colors.ink, gap: spacing.sm }}>
      <Text color={colors.cream} variant="screenTitle">{request.service_type_label_he}</Text>
      <Text color={colors.cream}>{request.reference}</Text>
      <Text color={colors.accentSoft} variant="sectionTitle">{serviceStatusLabels[request.state]}</Text>
    </Card>
    <Text>{request.description}</Text>
    <Text>{request.urgency_name_he} · תוספת דחיפות {request.urgency_surcharge_percent}% לאבחון ולתיקון נוסף</Text>
    <AppointmentCard request={request} />
    {request.media.some(item => item.purpose === 'issue') ? <MediaGrid scope={sessionScope} items={request.media.filter(item => item.purpose === 'issue').map(item => ({ id: item.media_id, uri: '', contentType: '' }))} /> : null}
    <Card style={{ gap: spacing.sm }}>
      <Text variant="sectionTitle">{request.diagnostic_fee_agorot === null ? 'דמי האבחון ייקבעו לאחר סקירת הבקשה' : `דמי אבחון: ${formatIls(request.diagnostic_fee_agorot)}`}</Text>
      <Text>{NON_REFUNDABLE_COPY}</Text>
      {allowed('pay_diagnostic') ? <>
        <Text>יש לשלם דמי אבחון לפני אישור תור ותחילת העבודה.</Text>
        <Button disabled={busy} onPress={() => void run(async () => {
          const result = await payForService(requestId, 'diagnostic', confirmer);
          setMessage(result.message); return result.request;
        })}>תשלום דמי אבחון</Button>
      </> : null}
      {allowed('cancel') ? <Button tone="soft" disabled={busy} onPress={() => setCancelConfirm(true)}>ביטול בקשה</Button> : null}
      {cancelConfirm && allowed('cancel') ? <View style={{ gap: spacing.sm }}>
        <Text>הבקשה תבוטל לפני תשלום דמי האבחון.</Text>
        <Button disabled={busy} onPress={() => void run(() => serviceApi.cancel(requestId))}>אישור ביטול הבקשה</Button>
        <Button disabled={busy} tone="soft" onPress={() => setCancelConfirm(false)}>חזרה</Button>
      </View> : null}
    </Card>
    <QuoteCard request={request} busy={busy || query.isRefetchError} onDecision={decision => run(() => serviceApi.decide(requestId, decision))} />
    {allowed('pay_additional') ? <Card style={{ gap: spacing.md }}>
      <Text>התיקון ימשיך רק לאחר אישור התשלום הנוסף.</Text>
      <Text>{NON_REFUNDABLE_COPY}</Text>
      <Button disabled={busy} onPress={() => void run(async () => {
        const result = await payForService(requestId, 'additional', confirmer);
        setMessage(result.message); return result.request;
      })}>תשלום נוסף</Button>
    </Card> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    <Text variant="sectionTitle">התקדמות השירות</Text>
    <StatusTimeline entries={serviceTimeline(request)} />
    {request.notes.map(note => <Card key={note.id}><Text>{note.body}</Text><Text variant="caption">{formatDateTime(note.created_at)}</Text></Card>)}
  </Screen>;
}

export default function ServiceDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { sessionScope } = useSession();
  const confirmer = usePaymentConfirmer();
  return <ServiceDetailContent key={`${sessionScope}-${requestId}`} requestId={requestId ?? ''} sessionScope={sessionScope ?? ''} confirmer={confirmer} />;
}

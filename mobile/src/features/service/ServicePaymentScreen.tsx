import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import { type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { goBack } from '../../navigation/goBack';
import { colors, spacing } from '../../theme';
import { secureTokenStore } from '../auth/store';
import { machineKeys } from '../machines/queries';
import type { PaymentConfirmer } from '../payments/usePayment';
import type { PaymentKind } from './api';
import { hasVerifiedServicePayment, payForService, type ServicePaymentResult } from './payments';
import { serviceKeys, useServiceRequest } from './queries';
import { NON_REFUNDABLE_COPY } from './status';

export function ServicePaymentContent({ requestId, sessionScope, kind, confirmer }: {
  requestId: string; sessionScope: string; kind: PaymentKind; confirmer: PaymentConfirmer;
}) {
  const query = useServiceRequest(sessionScope, requestId);
  const client = useQueryClient();
  const active = useRef(true);
  const started = useRef(false);
  const locked = useRef(false);
  const [status, setStatus] = useState<ServicePaymentResult['status'] | 'submitting'>('submitting');
  const [message, setMessage] = useState('');
  const verified = Boolean(query.data && hasVerifiedServicePayment(query.data, kind));
  const unavailable = query.data && !verified && !query.data.allowed_actions.includes(kind === 'diagnostic' ? 'pay_diagnostic' : 'pay_additional');
  const back = () => goBack({ pathname: '/(tabs)/(service)/requests/[requestId]', params: { requestId } } as Href);
  useEffect(() => {
    active.current = true;
    const unsubscribe = secureTokenStore.subscribeToClear(() => { active.current = false; });
    return () => { active.current = false; unsubscribe(); };
  }, []);
  const execute = useCallback(async () => {
    if (locked.current || !active.current) return;
    locked.current = true; setStatus('submitting'); setMessage('');
    try {
      const result = await payForService(requestId, kind, {
        confirm: payment => active.current ? confirmer.confirm(payment) : Promise.resolve({ status: 'unknown', message: '' }),
      });
      if (!active.current) return;
      client.setQueryData(serviceKeys.detail(sessionScope, requestId), result.request);
      setStatus(result.status); setMessage(result.message);
    } catch {
      if (active.current) { setStatus('retry'); setMessage('לא הצלחנו לבדוק את התשלום. בדקו את החיבור ונסו שוב.'); }
    } finally { locked.current = false; }
  }, [client, confirmer, kind, requestId, sessionScope]);
  useEffect(() => {
    if (query.data && !started.current) { started.current = true; void execute(); }
    // The route starts one attempt; refreshes only reconcile, never reopen Stripe.
  }, [query.data, execute]);
  useEffect(() => {
    if (verified && query.data) {
      void client.invalidateQueries({ queryKey: serviceKeys.list(sessionScope) });
      void client.invalidateQueries({ queryKey: machineKeys.detail(sessionScope, query.data.machine_id) });
    }
  }, [verified, query.data?.machine_id, client, sessionScope]);
  const header = <View style={styles.header}><BackButton onPress={back} /><Text align="start" variant="sectionTitle">{kind === 'diagnostic' ? 'תשלום אגרת אבחון' : 'תשלום נוסף'}</Text></View>;
  if (query.isPending || (query.isError && !query.data)) return <Screen header={header}>{query.isError ? <ErrorState message="לא הצלחנו לטעון את התשלום" onRetry={() => void query.refetch()} /> : <ActivityIndicator color={colors.accent} />}</Screen>;
  return <Screen header={header} scroll contentContainerStyle={styles.content}>
    <View style={[styles.symbol, { backgroundColor: verified ? colors.sage : colors.accent }]}>
      <Feather name={verified ? 'check' : 'credit-card'} size={34} color={colors.cream} />
    </View>
    <Text align="center" variant="screenTitle" accessibilityLiveRegion="polite">{verified ? 'התשלום התקבל בהצלחה' : unavailable ? 'התשלום אינו זמין לבקשה זו' : status === 'submitting' ? 'פותחים תשלום מאובטח' : status === 'pending' ? 'ממתינים לאישור התשלום מהשרת' : status === 'unavailable' ? 'התשלום אינו זמין לבקשה זו' : 'התשלום עדיין לא אושר'}</Text>
    <Text align="center" color={colors.ink3}>{query.data?.reference}</Text>
    {verified ? <Text align="center">אישור התשלום התקבל מהשרת. אפשר לחזור למעקב הבקשה.</Text> : <>
      {message ? <Text align="center" accessibilityLiveRegion="polite">{message}</Text> : null}
      {query.isRefetchError ? <Text align="center">אין כרגע חיבור לשרת. לא ניתן לאשר שהתשלום התקבל.</Text> : null}
      {status === 'submitting' ? <ActivityIndicator color={colors.accent} /> : null}
      {status === 'retry' && !unavailable ? <Button onPress={() => void execute()}>ניסיון נוסף</Button> : null}
      {(status === 'pending' && !unavailable) || query.isRefetchError ? <Button tone="soft" disabled={query.isFetching} onPress={() => void query.refetch()}>בדיקת מצב התשלום</Button> : null}
      <Text align="center" variant="caption" color={colors.ink3}>{NON_REFUNDABLE_COPY}</Text>
    </>}
  </Screen>;
}
const styles = StyleSheet.create({
  header: { direction: 'rtl', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  content: { justifyContent: 'center', gap: spacing.lg, paddingBottom: spacing['3xl'] },
  symbol: { width: 88, height: 88, borderRadius: 44, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
});

import { ApiClientError } from '@coffix/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { MediaGrid } from '../../components/MediaGrid';
import { Screen } from '../../components/Screen';
import { ServiceStepper } from '../../components/ServiceStepper';
import { Text } from '../../components/Text';
import { addressesApi } from '../addresses/api';
import { useSession } from '../auth/useSession';
import { formatIls } from '../catalog/types';
import { machineKeys, useMachine } from '../machines/queries';
import { formatDateTime } from '../machines/warranty';
import { serviceApi, type ServiceRequest } from './api';
import { intakeInput, intakeStore } from './intakeStore';
import { useIntakeDraft } from './useIntakeDraft';
import { LocationFields } from './LocationFields';
import { serviceKeys, useServiceOptions } from './queries';
import { isDefiniteRejection, reconcileSubmission } from './submission';
import { addressLabel, NON_REFUNDABLE_COPY, PREFERRED_WINDOW_COPY } from './status';
import { colors, spacing } from '../../theme';

const routes = ['type', 'issue', 'location', 'review'] as const;
export function intakeRoute(step: number, machineId: string): Href {
  return { pathname: `/(tabs)/(service)/request/${routes[step] ?? 'type'}`, params: { machineId } } as Href;
}
export function IntakeContent({ machineId, sessionScope, step }: { machineId: string; sessionScope: string; step: number }) {
  const machine = useMachine(sessionScope, machineId);
  const options = useServiceOptions(sessionScope, machineId);
  const { draft, update, ready, error: storageError, active } = useIntakeDraft(sessionScope, machineId);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const inFlight = useRef(false);
  const client = useQueryClient();
  const addresses = useQuery({ queryKey: ['private', sessionScope, 'addresses'], queryFn: () => addressesApi.list(), enabled: step === 3 && draft.locationMode === 'pickup' && Boolean(draft.addressId) });
  const selectedAddress = addresses.data?.find(address => address.id === draft.addressId);
  const selected = options.data?.service_types.find(type => type.id === draft.serviceTypeId);
  const change = (changes: Parameters<typeof update>[0]) => { void update(changes).catch(() => {}); };
  const finish = async (created: ServiceRequest) => {
    await intakeStore.clear(sessionScope, machineId);
    if (!active.current) return;
    client.setQueryData(serviceKeys.detail(sessionScope, created.id), created);
    void client.invalidateQueries({ queryKey: machineKeys.detail(sessionScope, machineId) });
    void client.invalidateQueries({ queryKey: serviceKeys.list(sessionScope) });
    router.replace({ pathname: '/(tabs)/(service)/request/confirmation', params: { requestId: created.id } } as unknown as Href);
  };
  const proceed = async () => {
    if (inFlight.current || !options.data || !ready || mediaBusy) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      if (draft.submission) {
        const found = await reconcileSubmission(draft);
        if (found) await finish(found);
        else setMessage('עדיין לא ניתן לוודא אם הבקשה נשלחה. רעננו שוב או פנו לצוות לפני שליחה נוספת.');
        return;
      }
      if (!selected) throw new Error('יש לבחור סוג שירות זמין למכונה.');
      if (step >= 1 && (draft.description.trim().length < 10 || draft.description.trim().length > 4000)) throw new Error('יש להזין תיאור באורך 10–4000 תווים.');
      if (step >= 2) intakeInput(draft, options.data.service_types.map(type => type.id), options.data.max_media_files);
      await update({});
      if (step < 3) { router.push(intakeRoute(step + 1, machineId)); return; }
      const refreshed = await options.refetch();
      if (!refreshed.data || refreshed.isError) throw new Error('לא הצלחנו לבדוק את דמי האבחון. נסו שוב.');
      const latestType = refreshed.data.service_types.find(type => type.id === selected.id);
      if (!latestType || latestType.diagnostic_fee_agorot !== selected.diagnostic_fee_agorot) throw new Error('פרטי השירות השתנו. יש לבדוק את הסיכום המעודכן ולשלוח שוב.');
      const input = intakeInput(draft, refreshed.data.service_types.map(type => type.id), refreshed.data.max_media_files);
      if (draft.locationMode === 'pickup' && draft.addressId && !selectedAddress) throw new Error('יש לחזור ולבחור כתובת איסוף זמינה.');
      const existingIds = (await serviceApi.list()).map(item => item.id);
      const submission = { existingIds, input };
      await update({ submission });
      try { await finish(await serviceApi.create(machineId, input)); }
      catch (err) {
        if (isDefiniteRejection(err)) { await update({ submission: null }); throw err; }
        const found = await reconcileSubmission({ ...draft, submission });
        if (found) await finish(found);
        else setMessage('מצב השליחה לא ידוע. יש לבדוק את הבקשה לפני ניסיון נוסף.');
      }
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.problem.code === 'SERVICE_TYPE_NOT_AVAILABLE' ? 'סוג השירות אינו זמין כעת. יש לבחור שירות אחר.' : 'לא הצלחנו לשמור את הבקשה. בדקו את הפרטים ונסו שוב.' : err instanceof Error && /[א-ת]/.test(err.message) ? err.message : 'לא הצלחנו לאמת את מצב הבקשה. נסו לבדוק שוב.');
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  };
  const onBack = () => router.replace(step > 0 ? intakeRoute(step - 1, machineId) : { pathname: '/(tabs)/(service)/machines/[machineId]', params: { machineId } } as Href);
  const header = <ServiceStepper step={step} onBack={onBack} />;
  if (machine.isError || options.isError) return <Screen header={header}><ErrorState message="לא הצלחנו לטעון את השירותים למכונה" onRetry={() => { void machine.refetch(); void options.refetch(); }} /></Screen>;
  if (!ready || !machine.data || !options.data) return <Screen header={header}><Text>{storageError || 'טוענים בקשת שירות'}</Text></Screen>;
  return <Screen header={header} scroll contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }} footer={<View style={{ padding: spacing.lg }}><Button disabled={busy || mediaBusy || Boolean(storageError)} onPress={() => void proceed()}>{draft.submission ? 'בדיקת מצב השליחה' : step === 3 ? 'שליחת בקשה' : 'המשך'}</Button></View>}>
    <Card><Text variant="caption">עבור</Text><Text variant="sectionTitle">{`${machine.data.model.manufacturer} ${machine.data.model.model_name}`}</Text></Card>
    {draft.submission ? <Text>הבקשה נשלחה לבדיקה. יש לברר את תוצאת השליחה לפני שינוי הטיוטה.</Text> : <>
      {step === 0 ? <>
        <Text variant="screenTitle">באיזה שירות אתם צריכים?</Text>
        {options.data.service_types.length === 0 ? <Text>אין שירותים זמינים למכונה זו כרגע.</Text> : null}
        {options.data.service_types.map(type => <Pressable key={type.id} accessibilityRole="radio" accessibilityLabel={`${type.label_he}, ${formatIls(type.diagnostic_fee_agorot)}`} accessibilityState={{ checked: draft.serviceTypeId === type.id }} onPress={() => change({ serviceTypeId: type.id })}>
          <Card style={{ borderColor: type.id === draft.serviceTypeId ? colors.ink : colors.line, gap: spacing.sm }}><Text variant="sectionTitle">{type.label_he}</Text><Text>דמי אבחון: {formatIls(type.diagnostic_fee_agorot)}</Text></Card>
        </Pressable>)}
      </> : null}
      {step === 1 ? <>
        <Text variant="screenTitle">ספרו על התקלה</Text><Text>ככל שנבין יותר, האבחון יהיה מדויק יותר.</Text>
        <Input label="תיאור התקלה" multiline maxLength={4000} value={draft.description} onChangeText={description => change({ description })} />
        <Text>{draft.description.length} / 4000 · 10 תווים לפחות</Text>
        <MediaGrid items={draft.media} scope={sessionScope} collectionId={draft.collectionId} maxFiles={options.data.max_media_files} maxImageBytes={options.data.max_image_bytes} maxVideoBytes={options.data.max_video_bytes} onChange={media => update({ media })} onBusy={setMediaBusy} />
      </> : null}
      {step === 2 ? <LocationFields draft={draft} scope={sessionScope} options={options.data} update={change} /> : null}
      {step === 3 ? <>
        <Text variant="screenTitle">סיכום הבקשה</Text>
        <Card style={{ gap: spacing.md }}>
          <Text variant="sectionTitle">{selected?.label_he ?? 'יש לבחור שירות זמין'}</Text>
          <Text>{draft.description}</Text>
          <Text>{draft.locationMode === 'bring_in' ? 'הבאה לחנות' : 'איסוף מהבית'}</Text>
          <Text>{draft.locationMode === 'bring_in' ? addressLabel(options.data.shop_address) : draft.addressId ? selectedAddress ? addressLabel(selectedAddress) : 'לא הצלחנו לטעון את כתובת האיסוף שנבחרה' : `${draft.address.street} ${draft.address.building}, ${draft.address.city}`}</Text>
          <Text>{draft.preferredStart ? `${formatDateTime(draft.preferredStart)} – ${formatDateTime(draft.preferredEnd)}` : 'ללא מועד מועדף'}</Text>
          <Text>{PREFERRED_WINDOW_COPY}</Text>
          <Text>{draft.media.length} קבצים מצורפים</Text>
          <Text variant="screenTitle">דמי אבחון: {formatIls(selected?.diagnostic_fee_agorot ?? 0)}</Text>
          <Text>דמי האבחון ייקבעו בעת שליחת הבקשה ויוצגו לפני התשלום. שליחת הבקשה אינה מחייבת את הכרטיס.</Text>
          <Text>{NON_REFUNDABLE_COPY}</Text>
        </Card>
      </> : null}
    </>}
    {storageError ? <Button tone="soft" onPress={() => change({})}>ניסיון שמירת טיוטה נוסף</Button> : null}
    {message || storageError ? <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>{storageError || message}</Text> : null}
  </Screen>;
}

export function IntakeRouteScreen({ step }: { step: number }) {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const { sessionScope } = useSession();
  if (!machineId) return <Screen><Text>יש לבחור מכונה לפני בקשת שירות.</Text><Button onPress={() => router.replace('/(tabs)/(service)/request/machineId' as Href)}>בחירת מכונה</Button></Screen>;
  return <IntakeContent key={`${sessionScope}-${machineId}`} machineId={machineId ?? ''} sessionScope={sessionScope ?? ''} step={step} />;
}

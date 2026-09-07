import { ApiClientError } from '@coffix/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { MediaGrid } from '../../components/MediaGrid';
import { Screen } from '../../components/Screen';
import { ServiceStepper } from '../../components/ServiceStepper';
import { Text } from '../../components/Text';
import { addressesApi } from '../addresses/api';
import { useSession } from '../auth/useSession';
import { machineKeys, useMachine } from '../machines/queries';
import { formatDateTime } from '../machines/warranty';
import { serviceApi, type ServiceRequest } from './api';
import { intakeInput, intakeStore } from './intakeStore';
import { useIntakeDraft } from './useIntakeDraft';
import { DiagnosticReviewNotice, IntakeMachine, IntakeSummary, IssueDescription, ServiceChoices, UrgencyChoices } from './IntakeChoices';
import { LocationFields } from './LocationFields';
import { serviceKeys, useServiceOptions } from './queries';
import { isDefiniteRejection, reconcileSubmission } from './submission';
import { addressLabel, PREFERRED_WINDOW_COPY } from './status';
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
  const urgency = draft.urgencyId ? options.data?.urgencies.find(item => item.id === draft.urgencyId) : options.data?.urgencies[0];
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
      if (step >= 1 && !urgency) throw new Error('יש לבחור רמת דחיפות זמינה.');
      if (step >= 1 && (draft.description.trim().length < 10 || draft.description.trim().length > 4000)) throw new Error('יש להזין תיאור באורך 10–4000 תווים.');
      if (step >= 2) intakeInput(draft, options.data.service_types.map(type => type.id), options.data.max_media_files);
      await update({ urgencyId: urgency?.id ?? draft.urgencyId });
      if (step < 3) { router.push(intakeRoute(step + 1, machineId)); return; }
      const refreshed = await options.refetch();
      if (!refreshed.data || refreshed.isError) throw new Error('לא הצלחנו לבדוק את דמי האבחון. נסו שוב.');
      const latestType = refreshed.data.service_types.find(type => type.id === selected.id);
      if (!latestType || latestType.diagnostic_fee_agorot !== selected.diagnostic_fee_agorot || refreshed.data.version !== options.data.version) throw new Error('פרטי השירות השתנו. יש לבדוק את הסיכום המעודכן ולשלוח שוב.');
      const input = intakeInput({ ...draft, urgencyId: urgency!.id }, refreshed.data.service_types.map(type => type.id), refreshed.data.max_media_files);
      input.intake_version = refreshed.data.version;
      if (input.preferred_window && !refreshed.data.preferred_windows.some(window => Date.parse(window.start) === Date.parse(input.preferred_window!.start) && Date.parse(window.end) === Date.parse(input.preferred_window!.end))) throw new Error('המועד שנבחר אינו זמין עוד. יש לחזור ולבחור יום ושעה.');
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
  if (!ready || !machine.data || !options.data) return <Screen header={header}><Text align="start">{storageError || 'טוענים בקשת שירות'}</Text></Screen>;
  return <Screen header={header} scroll contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.xl }} footer={<View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.line }}><Button disabled={busy || mediaBusy || Boolean(storageError)} onPress={() => void proceed()}>{draft.submission ? 'בדיקת מצב השליחה' : step === 3 ? 'שליחת בקשה' : 'המשך'}</Button></View>}>
    {step === 0 ? <IntakeMachine manufacturer={machine.data.model.manufacturer} model={machine.data.model.model_name} /> : null}
    {draft.submission ? <Text align="start">הבקשה נשלחה לבדיקה. יש לברר את תוצאת השליחה לפני שינוי הטיוטה.</Text> : <>
      {step === 0 ? <>
        <Text align="start" variant="screenTitle">באיזה שירות אתם צריכים?</Text>
        {options.data.service_types.length === 0 ? <Text align="start">אין שירותים זמינים למכונה זו כרגע.</Text> : null}
        <ServiceChoices types={options.data.service_types} selectedId={draft.serviceTypeId} onSelect={serviceTypeId => change({ serviceTypeId })} />
      </> : null}
      {step === 1 ? <>
        <View style={{ gap: spacing.sm }}><Text align="start" variant="screenTitle">ספרו על התקלה</Text><Text align="start" color={colors.ink3}>ככל שנבין יותר, האבחון יהיה מדויק יותר.</Text></View>
        <IssueDescription value={draft.description} onChange={description => change({ description })} />
        <MediaGrid items={draft.media} scope={sessionScope} collectionId={draft.collectionId} maxFiles={options.data.max_media_files} maxImageBytes={options.data.max_image_bytes} maxVideoBytes={options.data.max_video_bytes} onChange={media => update({ media })} onBusy={setMediaBusy} />
        <UrgencyChoices options={options.data.urgencies} selectedId={urgency?.id} onSelect={urgencyId => change({ urgencyId })} />
      </> : null}
      {step === 2 ? <LocationFields draft={draft} scope={sessionScope} options={options.data} update={change} /> : null}
      {step === 3 ? <>
        <Text align="start" variant="screenTitle">עוברים על הפרטים</Text>
        <IntakeSummary rows={[
          ['מכונה', `${machine.data.model.manufacturer} ${machine.data.model.model_name}`],
          ['סוג שירות', selected?.label_he ?? 'יש לבחור שירות זמין'],
          ['דחיפות', urgency ? `${urgency.name_he} · +${urgency.surcharge_percent}%` : 'יש לבחור דחיפות'],
          ['מיקום', draft.locationMode === 'bring_in' ? 'הבאה לחנות' : 'איסוף מהבית'],
          ...(draft.locationMode === 'pickup' ? [['כתובת', draft.addressId ? selectedAddress ? addressLabel(selectedAddress) : 'לא הצלחנו לטעון את כתובת האיסוף שנבחרה' : `${draft.address.street} ${draft.address.building}, ${draft.address.city}`] as [string, string]] : []),
          ['מועד מועדף', draft.preferredStart ? `${formatDateTime(draft.preferredStart)} – ${new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(draft.preferredEnd))}` : 'ללא מועד מועדף'],
        ]} />
        <DiagnosticReviewNotice />
        <Text align="start" variant="caption" color={colors.ink3}>{PREFERRED_WINDOW_COPY}</Text>
      </> : null}
    </>}
    {storageError ? <Button tone="soft" onPress={() => change({})}>ניסיון שמירת טיוטה נוסף</Button> : null}
    {message || storageError ? <Text align="start" accessibilityLiveRegion="polite" color={colors.accentDeep}>{storageError || message}</Text> : null}
  </Screen>;
}

export function IntakeRouteScreen({ step }: { step: number }) {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const { sessionScope } = useSession();
  if (!machineId) return <Screen><Text align="start">יש לבחור מכונה לפני בקשת שירות.</Text><Button onPress={() => router.replace('/(tabs)/(service)/request/machineId' as Href)}>בחירת מכונה</Button></Screen>;
  return <IntakeContent key={`${sessionScope}-${machineId}`} machineId={machineId ?? ''} sessionScope={sessionScope ?? ''} step={step} />;
}

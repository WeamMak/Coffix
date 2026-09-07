import Feather from '@expo/vector-icons/Feather';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { goBack } from '../../navigation/goBack';
import { useSession } from '../auth/useSession';
import { useIntakeDraft } from './useIntakeDraft';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { addressesApi } from '../addresses/api';
import { emptyAddressForm, toAddressCreate, validateAddressForm, type AddressForm } from '../addresses/form';
import type { IntakeDraft } from './intakeStore';
import { addressLabel } from './status';
import { colors, spacing } from '../../theme';

const fields: { key: keyof Omit<AddressForm, 'isDefault'>; label: string; max: number }[] = [
  { key: 'recipientName', label: 'שם מקבל או מקבלת', max: 120 },
  { key: 'phone', label: 'טלפון', max: 24 }, { key: 'street', label: 'רחוב', max: 120 },
  { key: 'building', label: 'מספר בית', max: 30 }, { key: 'apartment', label: 'דירה (לא חובה)', max: 30 },
  { key: 'city', label: 'עיר', max: 80 }, { key: 'postalCode', label: 'מיקוד (לא חובה)', max: 12 },
];

const addressRoute = (page: 'addresses' | 'address' | 'location', machineId: string) => ({
  pathname: `/(tabs)/(service)/request/${page}`, params: { machineId },
}) as Href;

export function PickupAddress({ draft, scope, update }: { draft: IntakeDraft; scope: string; update: (changes: Partial<IntakeDraft>) => void }) {
  const addresses = useQuery({ queryKey: ['private', scope, 'addresses'], queryFn: () => addressesApi.list() });
  const selected = addresses.data?.find(address => address.id === draft.addressId);
  useEffect(() => {
    if (!draft.addressId && addresses.data?.length) {
      update({ addressId: (addresses.data.find(address => address.is_default) ?? addresses.data[0]!).id });
    }
  }, [addresses.data, draft.addressId, update]);
  return <Pressable accessibilityRole="button" accessibilityLabel={selected ? `בחירת כתובת איסוף: ${addressLabel(selected)}` : 'בחירת כתובת איסוף'} onPress={() => router.push(addressRoute('addresses', draft.machineId))}>
    <Card style={styles.address}>
      <Feather name="map-pin" color={colors.ink2} size={18} />
      <View style={{ flex: 1 }}>
        <Text align="start">{selected ? `${selected.street} ${selected.building}${selected.apartment ? `, דירה ${selected.apartment}` : ''}` : addresses.isPending ? 'טוענים כתובות' : 'בחירת כתובת איסוף'}</Text>
        <Text align="start" variant="caption" color={colors.ink3}>{selected?.city ?? 'מהפרופיל שלכם או כתובת חדשה'}</Text>
      </View>
      <Feather name="chevron-left" color={colors.ink3} size={18} />
    </Card>
  </Pressable>;
}

export function PickupAddressContent({ machineId, scope, adding }: { machineId: string; scope: string; adding: boolean }) {
  const navigation = useNavigation();
  const key = ['private', scope, 'addresses'];
  const client = useQueryClient();
  const addresses = useQuery({ queryKey: key, queryFn: () => addressesApi.list() });
  const { draft, update, loaded, ready, error: storageError, active } = useIntakeDraft(scope, machineId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const back = () => { if (!busy) goBack(addressRoute(adding ? 'addresses' : 'location', machineId)); };
  const select = async (id: string, resetForm = false) => {
    await update({ addressId: id, ...(resetForm ? { address: { ...emptyAddressForm } } : {}) });
    if (active.current && navigation.isFocused()) router.dismissTo(addressRoute('location', machineId));
  };
  const save = async () => {
    if (locked.current || !ready) return;
    if (Object.keys(validateAddressForm(draft.address)).length) { setError('יש להזין כתובת ישראלית מלאה וטלפון תקין.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const created = await addressesApi.create(toAddressCreate(draft.address));
      if (!active.current) return;
      client.setQueryData(key, [...(addresses.data ?? []), created]);
      await select(created.id, true);
    } catch { if (active.current) setError('לא הצלחנו לשמור את הכתובת. בדקו את החיבור ונסו שוב.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  return <Screen scroll contentContainerStyle={{ paddingVertical: spacing.xl, gap: spacing.lg }}>
    <View style={{ direction: 'rtl' }}><BackButton accessibilityLabel={adding ? 'חזרה לכתובות' : 'חזרה למיקום ומועד'} disabled={busy} onPress={back} style={{ alignSelf: 'flex-start' }} /></View>
    <Text align="start" variant="screenTitle">{adding ? 'הוספת כתובת' : 'כתובת לאיסוף'}</Text>
    {!loaded ? <Text align="start">{storageError || 'טוענים כתובות'}</Text> : adding ? <>
      {fields.map(field => <Input key={field.key} label={field.label} maxLength={field.max} value={draft.address[field.key]} editable={!busy && ready} keyboardType={field.key === 'phone' ? 'phone-pad' : 'default'} onChangeText={value => { void update({ address: { ...draft.address, [field.key]: value } }).catch(() => {}); }} />)}
      <Button disabled={busy || !ready || Boolean(storageError)} onPress={() => void save()}>שמירת כתובת ובחירה</Button>
    </> : <>
      {addresses.isError ? <Button tone="soft" onPress={() => void addresses.refetch()}>טעינת כתובות מחדש</Button> : null}
      {addresses.data?.map(address => <Pressable key={address.id} accessibilityRole="radio" accessibilityLabel={addressLabel(address)} accessibilityState={{ checked: address.id === draft.addressId, disabled: !ready }} disabled={!ready} onPress={() => { void select(address.id).catch(() => {}); }}>
        <Card style={{ borderColor: address.id === draft.addressId ? colors.ink : colors.line }}><Text align="start">{addressLabel(address)}</Text>{address.is_default ? <Text align="start" variant="caption" color={colors.ink3}>כתובת ברירת מחדל</Text> : null}</Card>
      </Pressable>)}
      <Button tone="soft" onPress={() => router.push(addressRoute('address', machineId))}>הוספת כתובת חדשה</Button>
    </>}
    {error || storageError ? <Text align="start" accessibilityLiveRegion="polite" color={colors.accentDeep}>{error || storageError}</Text> : null}
  </Screen>;
}

export function PickupAddressRoute({ adding = false }: { adding?: boolean }) {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const { sessionScope } = useSession();
  return <PickupAddressContent machineId={machineId ?? ''} scope={sessionScope ?? ''} adding={adding} />;
}
const styles = StyleSheet.create({ address: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md, padding: spacing.lg } });

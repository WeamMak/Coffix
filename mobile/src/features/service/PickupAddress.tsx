import Feather from '@expo/vector-icons/Feather';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { addressesApi } from '../addresses/api';
import { emptyAddressForm, toAddressCreate, validateAddressForm, type AddressForm } from '../addresses/form';
import { secureTokenStore } from '../auth/store';
import type { IntakeDraft } from './intakeStore';
import { addressLabel } from './status';
import { colors, spacing } from '../../theme';

const fields: { key: keyof Omit<AddressForm, 'isDefault'>; label: string; max: number }[] = [
  { key: 'recipientName', label: 'שם מקבל או מקבלת', max: 120 },
  { key: 'phone', label: 'טלפון', max: 24 }, { key: 'street', label: 'רחוב', max: 120 },
  { key: 'building', label: 'מספר בית', max: 30 }, { key: 'apartment', label: 'דירה (לא חובה)', max: 30 },
  { key: 'city', label: 'עיר', max: 80 }, { key: 'postalCode', label: 'מיקוד (לא חובה)', max: 12 },
];

export function PickupAddress({ draft, scope, update }: { draft: IntakeDraft; scope: string; update: (changes: Partial<IntakeDraft>) => void }) {
  const key = ['private', scope, 'addresses'];
  const client = useQueryClient();
  const addresses = useQuery({ queryKey: key, queryFn: () => addressesApi.list() });
  const selected = addresses.data?.find(address => address.id === draft.addressId);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddressForm>({ ...emptyAddressForm });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const unsubscribe = secureTokenStore.subscribeToClear(() => { active.current = false; });
    return () => { active.current = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!draft.addressId && addresses.data?.length) {
      update({ addressId: (addresses.data.find(address => address.is_default) ?? addresses.data[0]!).id });
    }
  }, [addresses.data, draft.addressId, update]);
  const save = async () => {
    if (locked.current) return;
    if (Object.keys(validateAddressForm(form)).length) { setError('יש להזין כתובת ישראלית מלאה וטלפון תקין.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const created = await addressesApi.create(toAddressCreate(form));
      if (!active.current) return;
      client.setQueryData(key, [...(addresses.data ?? []), created]);
      update({ addressId: created.id });
      setOpen(false); setAdding(false); setForm({ ...emptyAddressForm });
    } catch { if (active.current) setError('לא הצלחנו לשמור את הכתובת. בדקו את החיבור ונסו שוב.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={selected ? `בחירת כתובת איסוף: ${addressLabel(selected)}` : 'בחירת כתובת איסוף'} onPress={() => setOpen(true)}>
      <Card style={styles.address}>
        <Feather name="map-pin" color={colors.ink2} size={18} />
        <View style={{ flex: 1 }}>
          <Text align="end">{selected ? `${selected.street} ${selected.building}${selected.apartment ? `, דירה ${selected.apartment}` : ''}` : addresses.isPending ? 'טוענים כתובות' : 'בחירת כתובת איסוף'}</Text>
          <Text align="end" variant="caption" color={colors.ink3}>{selected?.city ?? 'מהפרופיל שלכם או כתובת חדשה'}</Text>
        </View>
        <Feather name="chevron-left" color={colors.ink3} size={18} />
      </Card>
    </Pressable>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <Screen scroll contentContainerStyle={{ paddingVertical: spacing.xl, gap: spacing.lg }}>
        <Text align="end" variant="screenTitle">{adding ? 'הוספת כתובת' : 'כתובת לאיסוף'}</Text>
        {adding ? <>
          {fields.map(field => <Input key={field.key} label={field.label} maxLength={field.max} value={form[field.key]} keyboardType={field.key === 'phone' ? 'phone-pad' : 'default'} onChangeText={value => setForm(current => ({ ...current, [field.key]: value }))} />)}
          {error ? <Text align="end" accessibilityLiveRegion="polite" color={colors.accentDeep}>{error}</Text> : null}
          <Button disabled={busy} onPress={() => void save()}>שמירת כתובת ובחירה</Button>
          <Button tone="soft" disabled={busy} onPress={() => setAdding(false)}>חזרה לכתובות</Button>
        </> : <>
          {addresses.isError ? <Button tone="soft" onPress={() => void addresses.refetch()}>טעינת כתובות מחדש</Button> : null}
          {addresses.data?.map(address => <Pressable key={address.id} accessibilityRole="radio" accessibilityLabel={addressLabel(address)} accessibilityState={{ checked: address.id === draft.addressId }} onPress={() => { update({ addressId: address.id }); setOpen(false); }}>
            <Card style={{ borderColor: address.id === draft.addressId ? colors.ink : colors.line }}><Text align="end">{addressLabel(address)}</Text>{address.is_default ? <Text align="end" variant="caption" color={colors.ink3}>כתובת ברירת מחדל</Text> : null}</Card>
          </Pressable>)}
          <Button tone="soft" onPress={() => { setAdding(true); setError(''); }}>הוספת כתובת חדשה</Button>
        </>}
        <Button tone="soft" disabled={busy} onPress={() => setOpen(false)}>סגירה</Button>
      </Screen>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ address: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md, padding: spacing.lg } });

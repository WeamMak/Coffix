import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Text } from '../../components/Text';
import { addressesApi } from '../addresses/api';
import type { AddressForm } from '../addresses/form';
import { formatDateTime } from '../machines/warranty';
import type { ServiceOptions } from './api';
import type { IntakeDraft } from './intakeStore';
import { addressLabel, PREFERRED_WINDOW_COPY } from './status';
import { spacing } from '../../theme';

const ADDRESS_FIELDS: { key: keyof Omit<AddressForm, 'isDefault'>; label: string; max: number }[] = [
  { key: 'recipientName', label: 'שם מקבל או מקבלת', max: 120 },
  { key: 'phone', label: 'טלפון', max: 24 }, { key: 'street', label: 'רחוב', max: 120 },
  { key: 'building', label: 'מספר בית', max: 30 }, { key: 'apartment', label: 'דירה (לא חובה)', max: 30 },
  { key: 'city', label: 'עיר', max: 80 }, { key: 'postalCode', label: 'מיקוד (לא חובה)', max: 12 },
];
export function LocationFields({ draft, scope, options, update }: { draft: IntakeDraft; scope: string; options: ServiceOptions; update: (changes: Partial<IntakeDraft>) => void }) {
  const addresses = useQuery({ queryKey: ['private', scope, 'addresses'], queryFn: () => addressesApi.list(), enabled: draft.locationMode === 'pickup' });
  const [picker, setPicker] = useState<{ field: 'preferredStart' | 'preferredEnd'; mode: 'date' | 'time' } | null>(null);
  return <View style={{ gap: spacing.md }}>
    <Text variant="screenTitle">איך נאסוף את המכונה?</Text>
    <Button tone={draft.locationMode === 'bring_in' ? 'ink' : 'soft'} onPress={() => update({ locationMode: 'bring_in', addressId: '' })}>הבאה לחנות</Button>
    <Button tone={draft.locationMode === 'pickup' ? 'ink' : 'soft'} onPress={() => update({ locationMode: 'pickup' })}>איסוף מהבית</Button>
    {draft.locationMode === 'bring_in' ? <Card><Text>{addressLabel(options.shop_address)}</Text></Card> : <>
      {addresses.isPending ? <Text>טוענים כתובות</Text> : null}
      {addresses.isError ? <Button tone="soft" onPress={() => void addresses.refetch()}>טעינת כתובות מחדש</Button> : null}
      {addresses.data?.map(address => <Button key={address.id} tone={draft.addressId === address.id ? 'ink' : 'soft'} onPress={() => update({ addressId: address.id })}>{addressLabel(address)}</Button>)}
      <Button tone={!draft.addressId ? 'ink' : 'soft'} onPress={() => update({ addressId: '' })}>כתובת חד פעמית</Button>
      {!draft.addressId ? ADDRESS_FIELDS.map(field => <Input key={field.key} label={field.label} maxLength={field.max} value={draft.address[field.key]} keyboardType={field.key === 'phone' ? 'phone-pad' : 'default'} onChangeText={value => update({ address: { ...draft.address, [field.key]: value } })} />) : null}
    </>}
    <Text variant="sectionTitle">מועד מועדף (אופציונלי)</Text>
    <Text>{PREFERRED_WINDOW_COPY}</Text>
    <Text>כל השעות לפי שעון ישראל.</Text>
    {(['preferredStart', 'preferredEnd'] as const).map(field => <Card key={field} style={{ gap: spacing.sm }}>
      <Text>{field === 'preferredStart' ? 'תחילת החלון המבוקש' : 'סיום החלון המבוקש'}</Text>
      <Text>{formatDateTime(draft[field]) || 'לא נבחר'}</Text>
      <Button tone="soft" onPress={() => setPicker({ field, mode: 'date' })}>{field === 'preferredStart' ? 'תאריך התחלה' : 'תאריך סיום'}</Button>
      <Button tone="soft" onPress={() => setPicker({ field, mode: 'time' })}>{field === 'preferredStart' ? 'שעת התחלה' : 'שעת סיום'}</Button>
    </Card>)}
    {picker ? <>
      <DateTimePicker value={new Date(draft[picker.field] || Date.now())} mode={picker.mode} timeZoneName="Asia/Jerusalem" is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => {
        if (Platform.OS !== 'ios' || event.type === 'dismissed') setPicker(null);
        if (event.type === 'set' && date) update({ [picker.field]: date.toISOString() });
      }} />
      {Platform.OS === 'ios' ? <Button tone="soft" onPress={() => setPicker(null)}>סיום בחירת מועד</Button> : null}
    </> : null}
    {draft.preferredStart || draft.preferredEnd ? <Button tone="soft" onPress={() => update({ preferredStart: '', preferredEnd: '' })}>ללא מועד מועדף</Button> : null}
  </View>;
}

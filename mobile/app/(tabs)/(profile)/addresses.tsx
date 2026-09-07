import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BackButton } from '../../../src/components/BackButton';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { addressesApi, type Address } from '../../../src/features/addresses/api';
import { emptyAddressForm, toAddressCreate, validateAddressForm, type AddressForm, type AddressFormErrors } from '../../../src/features/addresses/form';
import { useSession } from '../../../src/features/auth/useSession';
import { useRefetchOnFocus } from '../../../src/features/orders/queries';
import { goBack } from '../../../src/navigation/goBack';
import { colors, spacing } from '../../../src/theme';

const fields: { key: Exclude<keyof AddressForm, 'isDefault'>; label: string; max: number }[] = [
  { key: 'recipientName', label: 'שם מקבל או מקבלת', max: 120 }, { key: 'phone', label: 'טלפון', max: 24 },
  { key: 'street', label: 'רחוב', max: 120 }, { key: 'building', label: 'מספר בית', max: 30 },
  { key: 'apartment', label: 'דירה (לא חובה)', max: 30 }, { key: 'city', label: 'עיר', max: 80 }, { key: 'postalCode', label: 'מיקוד (לא חובה)', max: 12 },
];
const label = (address: Address) => `${address.street} ${address.building}, ${address.city}`;
function formFor(address: Address): AddressForm {
  return { recipientName: address.recipient_name, phone: address.phone_e164, street: address.street, building: address.building, apartment: address.apartment ?? '', city: address.city, postalCode: address.postal_code ?? '', isDefault: address.is_default };
}
export function AddressesContent({ sessionScope }: { sessionScope: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['private', sessionScope, 'addresses'], queryFn: addressesApi.list, enabled: Boolean(sessionScope), staleTime: 0 });
  useRefetchOnFocus(query.refetch);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<AddressForm>(emptyAddressForm);
  const [errors, setErrors] = useState<AddressFormErrors>({});
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const mutate = async (action: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await action();
      if (!active.current) return;
      setEditing(null); setDeleting(null);
      await client.invalidateQueries({ queryKey: ['private', sessionScope, 'addresses'] });
    } catch { if (active.current) setError('לא הצלחנו לשמור את השינוי. נסו שוב.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  return <Screen scroll contentContainerStyle={styles.screen} header={<View style={styles.header}><BackButton disabled={busy} onPress={() => {
    if (editing !== null) { setEditing(null); setErrors({}); } else goBack('/(tabs)/(profile)');
  }} /><Text accessibilityRole="header" variant="screenTitle">{editing === null ? 'הכתובות שלי' : editing ? 'עריכת כתובת' : 'הוספת כתובת'}</Text></View>}>
    {error ? <Text accessibilityRole="alert" color={colors.accentDeep}>{error}</Text> : null}
    {editing !== null ? <>
      {fields.map(field => <Input key={field.key} label={field.label} value={values[field.key]} maxLength={field.max} error={errors[field.key]} editable={!busy} direction={field.key === 'phone' ? 'ltr' : 'rtl'} keyboardType={field.key === 'phone' ? 'phone-pad' : 'default'} onChangeText={value => setValues(current => ({ ...current, [field.key]: value }))} />)}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="כתובת ברירת מחדל" accessibilityState={{ checked: values.isDefault, disabled: busy }} disabled={busy} style={styles.check} onPress={() => setValues(current => ({ ...current, isDefault: !current.isDefault }))}><Text>{values.isDefault ? '✓ ' : '○ '}כתובת ברירת מחדל</Text></Pressable>
      <Button disabled={busy} onPress={() => {
        const validation = validateAddressForm(values); setErrors(validation);
        if (Object.keys(validation).length) return;
        void mutate(() => editing ? addressesApi.update(editing, toAddressCreate(values)) : addressesApi.create(toAddressCreate(values)));
      }}>שמירת כתובת</Button>
    </> : <>
      {query.isPending ? <ActivityIndicator accessibilityLabel="טוענים כתובות" /> : null}
      {query.isError ? <><Text>לא הצלחנו לטעון כתובות.</Text><Button onPress={() => void query.refetch()}>ניסיון נוסף</Button></> : null}
      {query.data?.length === 0 ? <Text>עדיין אין כתובות שמורות.</Text> : null}
      {query.data?.map(address => <Card key={address.id} style={{ gap: spacing.md }}><Text variant="sectionTitle">{label(address)}</Text><Text>{address.recipient_name}{address.apartment ? ` · דירה ${address.apartment}` : ''}</Text>
        {address.is_default ? <Text color={colors.accentDeep}>כתובת ברירת מחדל</Text> : <Button tone="soft" size="small" disabled={busy} accessibilityLabel={`הגדרה כברירת מחדל: ${label(address)}`} onPress={() => void mutate(() => addressesApi.update(address.id, { is_default: true }))}>הגדרה כברירת מחדל</Button>}
        <Button tone="soft" size="small" disabled={busy} accessibilityLabel={`עריכת כתובת: ${label(address)}`} onPress={() => { setValues(formFor(address)); setErrors({}); setError(''); setEditing(address.id); }}>עריכה</Button>
        <Button tone="soft" size="small" disabled={busy} accessibilityLabel={`מחיקת כתובת: ${label(address)}`} onPress={() => setDeleting(address)}>מחיקה</Button>
        {deleting?.id === address.id ? <View style={{ gap: spacing.sm }}><Text>למחוק את הכתובת השמורה?</Text><Button disabled={busy} onPress={() => void mutate(() => addressesApi.remove(address.id))}>אישור מחיקה</Button><Button tone="soft" disabled={busy} onPress={() => setDeleting(null)}>ביטול</Button></View> : null}
      </Card>)}
      <Button disabled={busy} onPress={() => { setValues({ ...emptyAddressForm }); setErrors({}); setError(''); setDeleting(null); setEditing(''); }}>הוספת כתובת חדשה</Button>
    </>}
  </Screen>;
}
export default function AddressesRoute() {
  const { sessionScope } = useSession();
  return <AddressesContent key={sessionScope} sessionScope={sessionScope ?? ''} />;
}
const styles = StyleSheet.create({ screen: { direction: 'rtl', gap: spacing.lg, paddingBottom: spacing.xl }, header: { direction: 'rtl', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl }, check: { minHeight: 44, justifyContent: 'center' } });

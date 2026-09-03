import Feather from '@expo/vector-icons/Feather';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { Input } from '../../../src/components/Input';
import { Pill } from '../../../src/components/Pill';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { addressesApi, type Address } from '../../../src/features/addresses/api';
import {
  type AddressForm,
  type AddressFormErrors,
  emptyAddressForm,
  toAddressCreate,
  validateAddressForm,
} from '../../../src/features/addresses/form';
import { useSession } from '../../../src/features/auth/useSession';
import { useCart } from '../../../src/features/cart/queries';
import { formatIls } from '../../../src/features/catalog/types';
import {
  type PaymentConfirmer,
  usePayment,
  usePaymentConfirmer,
} from '../../../src/features/payments/usePayment';
import { colors, radii, spacing } from '../../../src/theme';

type CheckoutContentProps = {
  confirmer?: PaymentConfirmer;
  sessionScope: string;
};

const addressKeys = {
  list: (scope: string) => ['private', scope, 'addresses'] as const,
};

function AddressFields({
  errors,
  onChange,
  values,
}: {
  errors: AddressFormErrors;
  onChange: (field: keyof AddressForm, value: string) => void;
  values: AddressForm;
}) {
  return (
    <View style={styles.form}>
      <Input
        error={errors.recipientName}
        label="שם מקבל או מקבלת"
        onChangeText={(value) => onChange('recipientName', value)}
        value={values.recipientName}
      />
      <Input
        direction="ltr"
        error={errors.phone}
        keyboardType="phone-pad"
        label="טלפון"
        onChangeText={(value) => onChange('phone', value)}
        placeholder="050-1234567"
        value={values.phone}
      />
      <Input
        error={errors.street}
        label="רחוב"
        onChangeText={(value) => onChange('street', value)}
        value={values.street}
      />
      <View style={styles.formRow}>
        <Input
          containerStyle={styles.formCell}
          error={errors.building}
          label="מספר בית"
          onChangeText={(value) => onChange('building', value)}
          value={values.building}
        />
        <Input
          containerStyle={styles.formCell}
          label="דירה (לא חובה)"
          onChangeText={(value) => onChange('apartment', value)}
          value={values.apartment}
        />
      </View>
      <Input
        error={errors.city}
        label="עיר"
        onChangeText={(value) => onChange('city', value)}
        value={values.city}
      />
      <Input
        keyboardType="number-pad"
        label="מיקוד (לא חובה)"
        onChangeText={(value) => onChange('postalCode', value)}
        value={values.postalCode}
      />
    </View>
  );
}

function SavedAddressCard({
  address,
  onPress,
  selected,
}: {
  address: Address;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${address.recipient_name}, ${address.street} ${address.building}, ${address.city}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addressCard,
        selected ? styles.addressSelected : undefined,
        pressed ? styles.pressed : undefined,
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : undefined]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.addressCopy}>
        <View style={styles.addressTitle}>
          <Text variant="sectionTitle">{address.recipient_name}</Text>
          {address.is_default ? <Pill tone="success">ברירת מחדל</Pill> : null}
        </View>
        <Text color={colors.ink2}>
          {address.street} {address.building}, {address.city}
        </Text>
      </View>
    </Pressable>
  );
}

export function CheckoutContent({ confirmer, sessionScope }: CheckoutContentProps) {
  const contextConfirmer = usePaymentConfirmer();
  const payment = usePayment({
    confirmer: confirmer ?? contextConfirmer,
    sessionScope,
  });
  const queryClient = useQueryClient();
  const cart = useCart(sessionScope);
  const addresses = useQuery({
    enabled: Boolean(sessionScope),
    queryFn: () => addressesApi.list(),
    queryKey: addressKeys.list(sessionScope),
  });
  const [addingAddress, setAddingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddressForm);
  const [addressErrors, setAddressErrors] = useState<AddressFormErrors>({});
  const [addressMessage, setAddressMessage] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  useEffect(() => {
    if (!selectedAddressId && addresses.data?.length) {
      setSelectedAddressId(
        addresses.data.find((address) => address.is_default)?.id ?? addresses.data[0]!.id,
      );
    }
  }, [addresses.data, selectedAddressId]);

  useEffect(() => {
    if (payment.status === 'verified' && payment.order) {
      router.replace({
        params: { orderId: payment.order.id },
        pathname: '/(tabs)/(shop)/confirmation',
      } as unknown as Href);
    }
  }, [payment.order, payment.status]);

  const saveAddress = async () => {
    if (savingAddress) {
      return;
    }
    const errors = validateAddressForm(addressForm);
    setAddressErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setSavingAddress(true);
    setAddressMessage('');
    try {
      const created = await addressesApi.create(toAddressCreate(addressForm));
      queryClient.setQueryData<Address[]>(addressKeys.list(sessionScope), (current = []) => [
        ...current,
        created,
      ]);
      setSelectedAddressId(created.id);
      setAddingAddress(false);
      setAddressForm(emptyAddressForm);
    } catch {
      setAddressMessage('לא הצלחנו לשמור את הכתובת. נסו שוב.');
    } finally {
      setSavingAddress(false);
    }
  };

  if (cart.isPending || addresses.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים את פרטי התשלום</Text>
      </Screen>
    );
  }

  if (cart.isError || addresses.isError) {
    return (
      <Screen contentContainerStyle={styles.centerState}>
        <ErrorState
          message="לא הצלחנו לטעון את פרטי התשלום"
          onRetry={() => {
            void Promise.all([cart.refetch(), addresses.refetch()]);
          }}
        />
      </Screen>
    );
  }

  const order = payment.checkout?.order;
  const summaryItems = order?.items ?? cart.data?.items ?? [];
  const subtotal = order?.subtotal_agorot ?? cart.data?.subtotal_agorot ?? 0;
  const total = order?.total_agorot ?? subtotal;

  return (
    <Screen contentContainerStyle={styles.root} safeAreaEdges={['bottom', 'top']}>
      <View style={styles.topBar}>
        <IconButton
          accessibilityLabel="חזרה לסל"
          icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
          onPress={() => router.replace('/(tabs)/(shop)/cart' as Href)}
        />
        <Text variant="screenTitle">תשלום</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View accessibilityLabel="שלבי התשלום" style={styles.steps}>
          {['כתובת', 'אמצעי תשלום', 'אישור'].map((label, index) => (
            <View key={label} style={styles.step}>
              <View style={[styles.stepNumber, index === 0 ? styles.stepActive : undefined]}>
                <Text color={index === 0 ? colors.cream : colors.ink3} variant="caption">
                  {index + 1}
                </Text>
              </View>
              <Text color={index === 0 ? colors.ink : colors.ink3} variant="caption">
                {label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text variant="label">כתובת למשלוח</Text>
          <View accessibilityRole="radiogroup" style={styles.addresses}>
            {(addresses.data ?? []).map((address) => (
              <SavedAddressCard
                address={address}
                key={address.id}
                onPress={() => setSelectedAddressId(address.id)}
                selected={address.id === selectedAddressId}
              />
            ))}
          </View>
          <Button
            accessibilityLabel="הוספת כתובת חדשה"
            onPress={() => setAddingAddress((current) => !current)}
            tone="soft"
          >
            הוספת כתובת חדשה
          </Button>
          {addingAddress ? (
            <View style={styles.newAddress}>
              <AddressFields
                errors={addressErrors}
                onChange={(field, value) => setAddressForm((current) => ({
                  ...current,
                  [field]: value,
                }))}
                values={addressForm}
              />
              {addressMessage ? (
                <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
                  {addressMessage}
                </Text>
              ) : null}
              <Button
                accessibilityLabel="שמירת כתובת"
                disabled={savingAddress}
                onPress={() => void saveAddress()}
              >
                {savingAddress ? 'שומרים כתובת' : 'שמירת כתובת'}
              </Button>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="label">אמצעי תשלום</Text>
          <View style={[styles.addressCard, styles.addressSelected]}>
            <View style={styles.deliveryIcon}>
              <Feather color={colors.cream} name="credit-card" size={20} />
            </View>
            <View style={styles.addressCopy}>
              <Text variant="sectionTitle">כרטיס אשראי מאובטח</Text>
              <Text color={colors.ink2} variant="caption">פרטי הכרטיס נאספים באופן מאובטח</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label">סיכום הזמנה</Text>
          <View style={styles.summary}>
            {summaryItems.map((item) => (
              <View key={item.sku_id} style={styles.summaryRow}>
                <View style={styles.addressCopy}>
                  <Text variant="sectionTitle">
                    {'product_name_he' in item ? item.product_name_he : item.name_he}
                  </Text>
                  <Text color={colors.ink3} variant="caption">כמות: {item.quantity}</Text>
                </View>
                <Text variant="label">{formatIls(item.line_total_agorot)}</Text>
              </View>
            ))}
            <View style={styles.summaryRow}>
              <Text color={colors.ink2}>סכום מוצרים</Text>
              <Text variant="label">{formatIls(subtotal)}</Text>
            </View>
            {order ? (
              <View style={styles.summaryRow}>
                <Text color={colors.ink2}>משלוח</Text>
                <Text variant="label">{formatIls(order.shipping_agorot)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {payment.message ? (
          <Text accessibilityLiveRegion="polite" color={
            payment.status === 'processing' ? colors.sage : colors.accentDeep
          }>
            {payment.message}
          </Text>
        ) : null}
        {payment.status === 'declined' || payment.status === 'unknown' ? (
          <Button onPress={() => void payment.retry()} tone="soft">ניסיון תשלום נוסף</Button>
        ) : null}
      </ScrollView>

      <View style={styles.checkoutBar}>
        <View>
          <Text color={colors.ink3} variant="caption">לתשלום</Text>
          <Text variant="screenTitle">{formatIls(total)}</Text>
        </View>
        <Button
          accessibilityLabel="תשלום מאובטח"
          disabled={!selectedAddressId || payment.isSubmitting || payment.status === 'processing'}
          onPress={() => void payment.start({ address_id: selectedAddressId })}
          style={styles.payButton}
        >
          {payment.isSubmitting ? 'פותחים תשלום' : 'תשלום מאובטח'}
        </Button>
      </View>
    </Screen>
  );
}

export default function CheckoutScreen() {
  const { sessionScope } = useSession();
  return <CheckoutContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  root: { paddingEnd: 0, paddingStart: 0 },
  centerState: { gap: spacing.lg, justifyContent: 'center' },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  scrollContent: {
    gap: spacing.xl,
    paddingBottom: 150,
    paddingHorizontal: spacing.xl,
  },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stepActive: { backgroundColor: colors.ink },
  section: { gap: spacing.md },
  addresses: { gap: spacing.sm },
  addressCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    padding: spacing.lg,
  },
  addressSelected: { borderColor: colors.ink },
  addressCopy: { flex: 1, gap: spacing.xs },
  addressTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  radio: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: { borderColor: colors.ink },
  radioDot: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  pressed: { opacity: 0.9 },
  newAddress: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  form: { gap: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md },
  formCell: { flex: 1 },
  deliveryIcon: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.input,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  summaryRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  checkoutBar: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    bottom: 0,
    end: 0,
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    position: 'absolute',
    start: 0,
  },
  payButton: { flex: 1 },
});

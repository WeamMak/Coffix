import Feather from '@expo/vector-icons/Feather';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { CheckoutHeader } from '../../../src/components/CheckoutHeader';
import { ErrorState } from '../../../src/components/ErrorState';
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
import { goBack } from '../../../src/navigation/goBack';
import { colors, radii, spacing } from '../../../src/theme';

type CheckoutContentProps = {
  createCheckoutKey?: () => string;
  sessionScope: string;
};

const addressKeys = {
  list: (scope: string) => ['private', scope, 'addresses'] as const,
};

let checkoutKeySequence = 0;

function defaultCheckoutKey(): string {
  checkoutKeySequence += 1;
  return `mobile-checkout-${Date.now()}-${checkoutKeySequence}`;
}

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
  disabled,
  onRemove,
  onSelect,
  selected,
}: {
  address: Address;
  disabled: boolean;
  onRemove: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const label = `${address.recipient_name}, ${address.street} ${address.building}, ${address.city}`;
  return (
    <View style={[styles.addressCard, selected ? styles.addressSelected : undefined]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        disabled={disabled}
        onPress={onSelect}
        style={({ pressed }) => [styles.addressChoice, pressed ? styles.pressed : undefined]}
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
      <Pressable
        accessibilityLabel={`הסרת הכתובת של ${address.recipient_name}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onRemove}
        style={({ pressed }) => [styles.removeAddress, pressed ? styles.pressed : undefined]}
      >
        <Text color={colors.accentDeep} variant="caption">הסרה</Text>
      </Pressable>
    </View>
  );
}

export function CheckoutContent({
  createCheckoutKey = defaultCheckoutKey,
  sessionScope,
}: CheckoutContentProps) {
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
  const [removingAddressId, setRemovingAddressId] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const addressFormIsValid = Object.keys(validateAddressForm(addressForm)).length === 0;

  useEffect(() => {
    if (!selectedAddressId && addresses.data?.length) {
      setSelectedAddressId(
        addresses.data.find((address) => address.is_default)?.id ?? addresses.data[0]!.id,
      );
    }
  }, [addresses.data, selectedAddressId]);

  const saveAddress = async () => {
    if (savingAddress || !addressFormIsValid) {
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
      setAddressErrors({});
    } catch {
      setAddressMessage('לא הצלחנו לשמור את הכתובת. נסו שוב.');
    } finally {
      setSavingAddress(false);
    }
  };

  const removeAddress = async (address: Address) => {
    if (removingAddressId) {
      return;
    }
    setRemovingAddressId(address.id);
    setAddressMessage('');
    try {
      await addressesApi.remove(address.id);
      const remaining = (addresses.data ?? []).filter((item) => item.id !== address.id);
      queryClient.setQueryData<Address[]>(addressKeys.list(sessionScope), remaining);
      if (selectedAddressId === address.id) {
        setSelectedAddressId(
          remaining.find((item) => item.is_default)?.id ?? remaining[0]?.id ?? '',
        );
      }
    } catch {
      setAddressMessage('לא הצלחנו להסיר את הכתובת. נסו שוב.');
    } finally {
      setRemovingAddressId('');
    }
  };

  const header = (
    <CheckoutHeader
      activeStep={1}
      backLabel="חזרה לסל"
      onBack={() => goBack('/(tabs)/(shop)/cart' as Href)}
    />
  );

  if (cart.isPending || addresses.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים את פרטי התשלום</Text>
      </Screen>
    );
  }

  if (cart.isError || addresses.isError) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ErrorState
          message="לא הצלחנו לטעון את פרטי התשלום"
          onRetry={() => {
            void Promise.all([cart.refetch(), addresses.refetch()]);
          }}
        />
      </Screen>
    );
  }

  const items = cart.data?.items ?? [];
  const subtotal = cart.data?.subtotal_agorot ?? 0;
  const footer = (
    <View style={styles.checkoutBar}>
      {addingAddress ? (
        <Button
          accessibilityLabel="שמירת כתובת"
          disabled={savingAddress || !addressFormIsValid}
          fullWidth
          onPress={() => void saveAddress()}
        >
          {savingAddress ? 'שומרים כתובת' : 'שמירת כתובת'}
        </Button>
      ) : (
        <Button
          accessibilityLabel="המשך לאמצעי תשלום"
          disabled={!selectedAddressId}
          fullWidth
          onPress={() => router.push({
            params: {
              addressId: selectedAddressId,
              checkoutKey: createCheckoutKey(),
            },
            pathname: '/(tabs)/(shop)/payment',
          } as unknown as Href)}
        >
          המשך לאמצעי תשלום
        </Button>
      )}
    </View>
  );

  return (
    <Screen
      contentContainerStyle={styles.scrollContent}
      footer={footer}
      header={header}
      keyboardShouldPersistTaps="handled"
      safeAreaEdges={['bottom', 'top']}
      scroll
    >
      <View style={styles.section}>
        <Text variant="label">כתובת למשלוח</Text>
        <View accessibilityRole="radiogroup" style={styles.addresses}>
          {(addresses.data ?? []).map((address) => (
            <SavedAddressCard
              address={address}
              disabled={removingAddressId === address.id}
              key={address.id}
              onRemove={() => void removeAddress(address)}
              onSelect={() => setSelectedAddressId(address.id)}
              selected={address.id === selectedAddressId}
            />
          ))}
        </View>
        <Pressable
          accessibilityLabel="הוספת כתובת חדשה"
          accessibilityRole="button"
          onPress={() => {
            setAddingAddress((current) => !current);
            setAddressErrors({});
            setAddressMessage('');
          }}
          style={({ pressed }) => [styles.addAddress, pressed ? styles.pressed : undefined]}
        >
          <Feather color={colors.ink2} name={addingAddress ? 'x' : 'plus'} size={18} />
          <Text color={colors.ink2} variant="label">
            {addingAddress ? 'סגירת כתובת חדשה' : 'הוספת כתובת חדשה'}
          </Text>
        </Pressable>
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
          </View>
        ) : addressMessage ? (
          <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
            {addressMessage}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text variant="label">משלוח</Text>
        <View style={[styles.deliveryCard, styles.addressSelected]}>
          <View style={styles.deliveryIcon}>
            <Feather color={colors.cream} name="truck" size={20} />
          </View>
          <View style={styles.addressCopy}>
            <Text variant="sectionTitle">משלוח סטנדרטי</Text>
            <Text color={colors.ink2} variant="caption">1-3 ימי עסקים</Text>
          </View>
          <Text color={colors.sage} variant="caption">המחיר יוצג לפני התשלום</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="label">סיכום הזמנה</Text>
        <View style={styles.summary}>
          {items.map((item) => (
            <View key={item.sku_id} style={styles.summaryRow}>
              <View style={styles.addressCopy}>
                <Text variant="sectionTitle">{item.name_he}</Text>
                <Text color={colors.ink3} variant="caption">כמות: {item.quantity}</Text>
              </View>
              <Text variant="label">{formatIls(item.line_total_agorot)}</Text>
            </View>
          ))}
          <View style={styles.summaryRow}>
            <Text color={colors.ink2}>סכום מוצרים</Text>
            <Text variant="label">{formatIls(subtotal)}</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

export default function CheckoutScreen() {
  const { sessionScope } = useSession();
  return <CheckoutContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  centerState: {
    gap: spacing.lg,
    justifyContent: 'center',
  },
  scrollContent: {
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  addresses: {
    gap: spacing.sm,
  },
  addressCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 88,
    overflow: 'hidden',
  },
  addressSelected: {
    borderColor: colors.ink,
  },
  addressChoice: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  addressCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  addressTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  removeAddress: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioSelected: {
    borderColor: colors.ink,
  },
  radioDot: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  pressed: {
    opacity: 0.9,
  },
  addAddress: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  newAddress: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formCell: {
    flex: 1,
  },
  deliveryCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.lg,
  },
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
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
});

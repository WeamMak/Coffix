import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { CheckoutHeader } from '../../../src/components/CheckoutHeader';
import { ErrorState } from '../../../src/components/ErrorState';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { cartApi } from '../../../src/features/cart/api';
import { cartKeys, useCart } from '../../../src/features/cart/queries';
import { formatIls } from '../../../src/features/catalog/types';
import { colors, radii, spacing } from '../../../src/theme';

type PaymentContentProps = {
  addressId: string;
  checkoutKey: string;
  sessionScope: string;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function PaymentContent({
  addressId,
  checkoutKey,
  sessionScope,
}: PaymentContentProps) {
  const cartQuery = useCart(sessionScope);
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const cart = cartQuery.data;
  const header = (
    <CheckoutHeader
      activeStep={2}
      backLabel="חזרה לכתובת"
      onBack={() => router.replace('/(tabs)/(shop)/checkout' as Href)}
    />
  );

  const startPayment = async () => {
    if (!addressId || !checkoutKey || !cart || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setIsSubmitting(true);
    setMessage('');
    try {
      const checkout = await cartApi.checkout({ address_id: addressId }, checkoutKey);
      queryClient.setQueryData(
        cartKeys.checkout(sessionScope, checkoutKey),
        checkout,
      );
      queryClient.setQueryData(
        cartKeys.order(sessionScope, checkout.order.id),
        checkout.order,
      );
      router.push({
        params: {
          addressId,
          checkoutKey,
          orderId: checkout.order.id,
        },
        pathname: '/(tabs)/(shop)/confirmation',
      } as unknown as Href);
    } catch {
      setMessage('לא הצלחנו לפתוח את התשלום. הסל נשמר ואפשר לנסות שוב.');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!addressId || !checkoutKey) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ErrorState
          message="חסרים פרטים לפתיחת התשלום"
          onRetry={() => router.replace('/(tabs)/(shop)/checkout' as Href)}
        />
      </Screen>
    );
  }

  if (cartQuery.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים את פרטי התשלום</Text>
      </Screen>
    );
  }

  if (cartQuery.isError || !cart || cart.items.length === 0) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ErrorState
          message="לא הצלחנו לטעון את הסל לתשלום"
          onRetry={() => void cartQuery.refetch()}
        />
      </Screen>
    );
  }

  const footer = (
    <View style={styles.paymentBar}>
      <View>
        <Text color={colors.ink3} variant="caption">לתשלום</Text>
        <Text variant="screenTitle">{formatIls(cart.total_agorot)}</Text>
      </View>
      <Button
        accessibilityLabel="תשלום מאובטח"
        disabled={isSubmitting}
        onPress={() => void startPayment()}
        style={styles.payButton}
      >
        {isSubmitting ? 'פותחים תשלום' : 'תשלום מאובטח'}
      </Button>
    </View>
  );

  return (
    <Screen
      contentContainerStyle={styles.scrollContent}
      footer={footer}
      header={header}
      safeAreaEdges={['bottom', 'top']}
      scroll
    >
      <View style={styles.section}>
        <Text variant="label">אמצעי תשלום</Text>
        <View style={styles.paymentCard}>
          <View style={styles.paymentIcon}>
            <Feather color={colors.cream} name="credit-card" size={20} />
          </View>
          <View style={styles.copy}>
            <Text variant="sectionTitle">כרטיס אשראי מאובטח</Text>
            <Text color={colors.ink2} variant="caption">
              פרטי הכרטיס נאספים באופן מאובטח
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="label">סיכום הזמנה</Text>
        <View style={styles.summary}>
          {cart.items.map((item) => (
            <View key={item.sku_id} style={styles.summaryRow}>
              <View style={styles.copy}>
                <Text variant="sectionTitle">{item.name_he}</Text>
                <Text color={colors.ink3} variant="caption">כמות: {item.quantity}</Text>
              </View>
              <Text variant="label">{formatIls(item.line_total_agorot)}</Text>
            </View>
          ))}
          <View style={styles.summaryRow}>
            <Text color={colors.ink2}>סכום מוצרים</Text>
            <Text variant="label">{formatIls(cart.subtotal_agorot)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text color={colors.ink2}>משלוח</Text>
            <Text variant="label">{formatIls(cart.shipping_agorot)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text variant="sectionTitle">לתשלום</Text>
            <Text variant="screenTitle">{formatIls(cart.total_agorot)}</Text>
          </View>
        </View>
      </View>

      {message ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}

export default function PaymentScreen() {
  const params = useLocalSearchParams<{
    addressId?: string | string[];
    checkoutKey?: string | string[];
  }>();
  const { sessionScope } = useSession();
  return (
    <PaymentContent
      addressId={firstParam(params.addressId)}
      checkoutKey={firstParam(params.checkoutKey)}
      sessionScope={sessionScope ?? ''}
    />
  );
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
  paymentCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderRadius: radii.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    padding: spacing.lg,
  },
  paymentIcon: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.input,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
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
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  paymentBar: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  payButton: {
    flex: 1,
  },
});

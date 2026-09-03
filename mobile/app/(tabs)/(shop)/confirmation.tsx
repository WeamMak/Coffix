import Feather from '@expo/vector-icons/Feather';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { CheckoutHeader } from '../../../src/components/CheckoutHeader';
import { ErrorState } from '../../../src/components/ErrorState';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { isVerifiedOrder } from '../../../src/features/cart/queries';
import { formatIls } from '../../../src/features/catalog/types';
import {
  type PaymentConfirmer,
  usePayment,
  usePaymentConfirmer,
  usePreparedCheckout,
} from '../../../src/features/payments/usePayment';
import { colors, radii, spacing } from '../../../src/theme';

type ConfirmationContentProps = {
  addressId?: string;
  checkoutKey?: string;
  confirmer?: PaymentConfirmer;
  orderId: string;
  pollIntervalMs?: number;
  sessionScope: string;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function ConfirmationContent({
  addressId = '',
  checkoutKey = '',
  confirmer,
  orderId,
  pollIntervalMs,
  sessionScope,
}: ConfirmationContentProps) {
  const contextConfirmer = usePaymentConfirmer();
  const prepared = usePreparedCheckout({ addressId, checkoutKey, sessionScope });
  const payment = usePayment({
    checkout: prepared.data,
    confirmer: confirmer ?? contextConfirmer,
    orderId,
    pollIntervalMs,
    sessionScope,
  });
  const order = payment.order;
  const header = <CheckoutHeader activeStep={3} />;

  useEffect(() => {
    if (prepared.data && payment.status === 'idle' && !isVerifiedOrder(order)) {
      void payment.start();
    }
  }, [order, payment.start, payment.status, prepared.data]);

  if (!orderId) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ErrorState
          message="חסר מספר הזמנה"
          onRetry={() => router.replace('/(tabs)/(shop)' as Href)}
        />
      </Screen>
    );
  }

  if (!order) {
    if (payment.orderIsError) {
      return (
        <Screen contentContainerStyle={styles.centerState} header={header}>
          <ErrorState
            message="לא הצלחנו לטעון את ההזמנה"
            onRetry={() => void payment.refetchOrder()}
          />
        </Screen>
      );
    }
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>בודקים את ההזמנה</Text>
      </Screen>
    );
  }

  if (
    payment.status === 'declined'
    || payment.status === 'unknown'
    || payment.status === 'failed'
    || payment.status === 'expired'
  ) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <Feather color={colors.accentDeep} name="alert-circle" size={52} />
        <Text align="center" variant="screenTitle">התשלום לא הושלם</Text>
        <Text align="center" color={colors.ink2}>{payment.message}</Text>
        {prepared.data && payment.status !== 'expired' ? (
          <Button onPress={() => void payment.retry()} tone="soft">
            ניסיון תשלום נוסף
          </Button>
        ) : null}
      </Screen>
    );
  }

  if (order.state === 'pending_payment') {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text align="center" variant="screenTitle">ממתינים לאישור התשלום</Text>
        <Text align="center" color={colors.ink2}>
          לא נסמן את ההזמנה כשולמה עד שהשרת יקבל אישור מאובטח.
        </Text>
      </Screen>
    );
  }

  if (!isVerifiedOrder(order)) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <Feather color={colors.accentDeep} name="alert-circle" size={52} />
        <Text align="center" variant="screenTitle">התשלום לא הושלם</Text>
        <Text align="center" color={colors.ink2}>{payment.message}</Text>
      </Screen>
    );
  }

  return (
    <Screen
      contentContainerStyle={styles.success}
      header={header}
      safeAreaEdges={['bottom', 'top']}
    >
      <View style={styles.checkmark}>
        <Feather color={colors.cream} name="check" size={44} />
      </View>
      <Text align="center" variant="display">ההזמנה התקבלה.</Text>
      <Text align="center" color={colors.accent} variant="screenTitle">תודה.</Text>
      <Text align="center" color={colors.ink2}>
        ניתן לעקוב אחרי ההזמנה בכל שלב.
      </Text>
      <View style={styles.orderCard}>
        <View style={styles.orderRow}>
          <Text color={colors.ink3} variant="eyebrow">מספר הזמנה</Text>
          <Text variant="sectionTitle">{order.order_number}</Text>
        </View>
        <View style={styles.orderRow}>
          <Text color={colors.ink3} variant="eyebrow">סך הכול</Text>
          <Text variant="sectionTitle">{formatIls(order.total_agorot)}</Text>
        </View>
      </View>
      <Button
        accessibilityLabel="מעקב אחרי ההזמנה"
        fullWidth
        onPress={() => router.push(`/(tabs)/(orders)/${order.id}` as Href)}
      >
        מעקב אחרי ההזמנה
      </Button>
      <Button
        fullWidth
        onPress={() => router.replace('/(tabs)/(home)' as Href)}
        tone="soft"
      >
        חזרה לבית
      </Button>
    </Screen>
  );
}

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{
    addressId?: string | string[];
    checkoutKey?: string | string[];
    orderId?: string | string[];
  }>();
  const { sessionScope } = useSession();
  return (
    <ConfirmationContent
      addressId={firstParam(params.addressId)}
      checkoutKey={firstParam(params.checkoutKey)}
      orderId={firstParam(params.orderId)}
      sessionScope={sessionScope ?? ''}
    />
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  success: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  checkmark: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    height: 90,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 90,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    marginVertical: spacing.lg,
    padding: spacing.xl,
    width: '100%',
  },
  orderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

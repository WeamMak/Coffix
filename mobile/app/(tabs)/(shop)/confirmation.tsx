import Feather from '@expo/vector-icons/Feather';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { CheckoutHeader } from '../../../src/components/CheckoutHeader';
import { ErrorState } from '../../../src/components/ErrorState';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { isVerifiedOrder, useOrder } from '../../../src/features/cart/queries';
import { formatIls } from '../../../src/features/catalog/types';
import { colors, radii, spacing } from '../../../src/theme';

type ConfirmationContentProps = {
  orderId: string;
  sessionScope: string;
};

export function ConfirmationContent({
  orderId,
  sessionScope,
}: ConfirmationContentProps) {
  const orderQuery = useOrder(sessionScope, orderId, true);
  const order = orderQuery.data;
  const header = <CheckoutHeader activeStep={3} />;

  if (orderQuery.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>בודקים את ההזמנה</Text>
      </Screen>
    );
  }

  if (orderQuery.isError || !order) {
    return (
      <Screen contentContainerStyle={styles.centerState} header={header}>
        <ErrorState
          message="לא הצלחנו לטעון את ההזמנה"
          onRetry={() => void orderQuery.refetch()}
        />
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
        <Button
          onPress={() => router.replace('/(tabs)/(shop)/cart' as Href)}
          tone="soft"
        >
          חזרה לסל
        </Button>
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
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const { sessionScope } = useSession();
  const orderId = Array.isArray(params.orderId)
    ? params.orderId[0] ?? ''
    : params.orderId ?? '';
  return <ConfirmationContent orderId={orderId} sessionScope={sessionScope ?? ''} />;
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

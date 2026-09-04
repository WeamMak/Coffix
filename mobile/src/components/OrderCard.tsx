import { Pressable, StyleSheet, View } from 'react-native';

import { formatIls } from '../features/catalog/types';
import type { Order } from '../features/orders/api';
import {
  formatOrderTimestamp,
  orderStatusLabel,
  orderStatusTone,
} from '../features/orders/status';
import { colors, radii, spacing } from '../theme';
import { Pill } from './Pill';
import { Text } from './Text';

type OrderCardProps = {
  onPress: (orderId: string) => void;
  order: Order;
};

export function OrderCard({ onPress, order }: OrderCardProps) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const statusLabel = orderStatusLabel(order.state);
  const meta = [formatOrderTimestamp(order.created_at), `${itemCount} פריטים`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityHint="פתיחת פרטי ההזמנה"
      accessibilityLabel={`הזמנה ${order.order_number}, ${statusLabel}`}
      accessibilityRole="button"
      onPress={() => onPress(order.id)}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : undefined]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text color={colors.ink3} variant="eyebrow">הזמנה</Text>
          <Text variant="sectionTitle">{order.order_number}</Text>
        </View>
        <Pill tone={orderStatusTone(order.state)}>{statusLabel}</Pill>
      </View>
      <View style={styles.metaRow}>
        <Text color={colors.ink3} variant="caption">{meta}</Text>
        <Text variant="sectionTitle">{formatIls(order.total_agorot)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
});

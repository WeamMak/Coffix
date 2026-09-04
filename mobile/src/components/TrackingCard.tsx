import Feather from '@expo/vector-icons/Feather';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { Order } from '../features/orders/api';
import {
  FULFILLMENT_STEPS,
  fulfillmentProgress,
  orderStatusExplanation,
  orderStatusLabel,
  safeTrackingUrl,
} from '../features/orders/status';
import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

type TrackingCardProps = {
  order: Order;
};

export function TrackingCard({ order }: TrackingCardProps) {
  const progress = fulfillmentProgress(order.state);
  const explanation = orderStatusExplanation(order.state);
  const shipment = order.shipment;
  const trackingUrl = safeTrackingUrl(shipment?.tracking_url);

  return (
    <View style={styles.card} testID="tracking-card">
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text color={colors.accent} variant="eyebrow">מעקב הזמנה</Text>
          <Text color={colors.cream} testID="tracking-status" variant="screenTitle">
            {orderStatusLabel(order.state)}
          </Text>
          {explanation ? (
            <Text color={colors.ink3} variant="caption">{explanation}</Text>
          ) : null}
        </View>
        <View style={styles.iconWrap}>
          <Feather color={colors.cream} name="truck" size={22} />
        </View>
      </View>

      {progress === null ? null : (
        <View style={styles.progress} testID="tracking-progress">
          <View style={styles.track}>
            {FULFILLMENT_STEPS.map((step, index) => (
              <View
                key={step}
                style={[styles.segment, index < progress ? styles.segmentFilled : null]}
              />
            ))}
          </View>
          <View style={styles.stepRow}>
            {FULFILLMENT_STEPS.map((step, index) => (
              <Text
                color={index < progress ? colors.accent : colors.ink3}
                key={step}
                style={styles.step}
                variant="caption"
              >
                {step}
              </Text>
            ))}
          </View>
        </View>
      )}

      {shipment ? (
        <View style={styles.shipment}>
          <View style={styles.shipmentRow}>
            <Text color={colors.ink3} variant="caption">חברת שילוח</Text>
            <Text color={colors.cream} variant="label">{shipment.carrier}</Text>
          </View>
          <View style={styles.shipmentRow}>
            <Text color={colors.ink3} variant="caption">מספר מעקב</Text>
            <Text color={colors.cream} variant="label">{shipment.tracking_number}</Text>
          </View>
          {trackingUrl ? (
            <Pressable
              accessibilityLabel="מעקב אחר המשלוח"
              accessibilityRole="button"
              onPress={() => { void Linking.openURL(trackingUrl); }}
              style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
            >
              <Feather color={colors.ink} name="external-link" size={16} />
              <Text variant="label">מעקב אחר המשלוח</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ink,
    borderRadius: radii.featured,
    gap: spacing.lg,
    padding: spacing.xl,
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
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(245, 239, 230, 0.1)',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  progress: {
    gap: spacing.sm,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    backgroundColor: 'rgba(245, 239, 230, 0.15)',
    borderRadius: 3,
    flex: 1,
    height: 6,
  },
  segmentFilled: {
    backgroundColor: colors.accent,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  step: {
    flex: 1,
    textAlign: 'center',
  },
  shipment: {
    borderTopColor: 'rgba(245, 239, 230, 0.12)',
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  shipmentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.cream,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.9,
  },
});

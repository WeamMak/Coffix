import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

type QuantityStepperProps = {
  decreaseLabel?: string;
  disabled?: boolean;
  increaseLabel?: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  value: number;
};

export function QuantityStepper({
  decreaseLabel = 'הפחתת כמות',
  disabled = false,
  increaseLabel = 'הגדלת כמות',
  maximum,
  minimum,
  onChange,
  value,
}: QuantityStepperProps) {
  const decreaseDisabled = disabled || value <= minimum;
  const increaseDisabled = disabled || value >= maximum;
  const update = (next: number) => onChange(Math.min(maximum, Math.max(minimum, next)));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ max: maximum, min: minimum, now: value }}
      style={styles.group}
    >
      <Pressable
        accessibilityLabel={decreaseLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: decreaseDisabled }}
        disabled={decreaseDisabled}
        onPress={() => update(value - 1)}
        style={({ pressed }) => [
          styles.action,
          pressed && !decreaseDisabled ? styles.pressed : undefined,
          decreaseDisabled ? styles.disabled : undefined,
        ]}
      >
        <Text align="center" variant="sectionTitle">−</Text>
      </Pressable>
      <Text align="center" style={styles.value} variant="label">{value}</Text>
      <Pressable
        accessibilityLabel={increaseLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: increaseDisabled }}
        disabled={increaseDisabled}
        onPress={() => update(value + 1)}
        style={({ pressed }) => [
          styles.action,
          pressed && !increaseDisabled ? styles.pressed : undefined,
          increaseDisabled ? styles.disabled : undefined,
        ]}
      >
        <Text align="center" variant="sectionTitle">+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    ...Platform.select({ default: { direction: 'ltr' }, web: {} }),
    flexDirection: 'row',
    minHeight: 56,
    overflow: 'hidden',
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 44,
  },
  value: {
    minWidth: 36,
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.accentSoft,
  },
  disabled: {
    opacity: 0.35,
  },
});

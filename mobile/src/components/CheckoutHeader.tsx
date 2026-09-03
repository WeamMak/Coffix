import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

const STEP_LABELS = ['כתובת', 'אמצעי תשלום', 'אישור'] as const;

type CheckoutHeaderProps = {
  activeStep: 1 | 2 | 3;
  backLabel?: string;
  onBack?: () => void;
};

export function CheckoutHeader({
  activeStep,
  backLabel = 'חזרה',
  onBack,
}: CheckoutHeaderProps) {
  const step = (label: (typeof STEP_LABELS)[number], index: number) => {
    const stepNumber = (index + 1) as 1 | 2 | 3;
    const active = stepNumber === activeStep;
    return (
      <View
        accessibilityLabel={active ? `שלב נוכחי: ${label}` : `שלב ${stepNumber}: ${label}`}
        accessible
        key={label}
        style={styles.step}
      >
        <View style={[styles.stepNumber, active ? styles.stepActive : undefined]}>
          <Text color={active ? colors.cream : colors.ink3} variant="caption">
            {stepNumber}
          </Text>
        </View>
        <Text color={active ? colors.ink : colors.ink3} variant="caption">
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        {onBack ? (
          <IconButton
            accessibilityLabel={backLabel}
            icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
            onPress={onBack}
            style={styles.backButton}
          />
        ) : <View style={styles.backPlaceholder} />}
        <Text variant="screenTitle">תשלום</Text>
      </View>
      <View accessibilityLabel="שלבי התשלום" style={styles.steps} testID="checkout-steps">
        {step(STEP_LABELS[0], 0)}
        <View style={styles.stepLine} testID="checkout-connector-1" />
        {step(STEP_LABELS[1], 1)}
        <View style={styles.stepLine} testID="checkout-connector-2" />
        {step(STEP_LABELS[2], 2)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.cream,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  backButton: {
    borderRadius: radii.pill,
  },
  backPlaceholder: {
    height: 44,
    width: 44,
  },
  steps: {
    alignItems: 'center',
    direction: 'rtl',
    flexDirection: 'row',
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stepActive: {
    backgroundColor: colors.ink,
  },
  stepLine: {
    backgroundColor: colors.line,
    flex: 1,
    height: 1,
    marginHorizontal: spacing.xs,
  },
});

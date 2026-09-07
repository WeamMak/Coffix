import { StyleSheet, View } from 'react-native';
import { BackButton } from './BackButton';
import { Text } from './Text';
import { colors, spacing } from '../theme';

export const SERVICE_STEPS = ['סוג שירות', 'פרטים', 'מיקום ומועד', 'סיכום'] as const;
export function ServiceStepper({ step, onBack }: { step: number; onBack: () => void }) {
  return <View style={styles.header}>
    <View style={styles.row}>
      <BackButton accessibilityLabel="חזרה" onPress={onBack} />
      <View><Text align="start" variant="eyebrow" color={colors.ink3}>שלב {step + 1} / 4</Text><Text align="start" variant="sectionTitle">{SERVICE_STEPS[step]}</Text></View>
    </View>
    <View accessibilityLabel={`שלב נוכחי: ${SERVICE_STEPS[step]}`} accessible style={styles.row}>
      {SERVICE_STEPS.map((label, index) => <View key={label} style={[styles.segment, { backgroundColor: index <= step ? colors.ink : colors.line }]} />)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.sm },
  segment: { height: 3, borderRadius: 2, flex: 1 },
});

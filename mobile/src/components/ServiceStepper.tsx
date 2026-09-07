import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { colors, spacing } from '../theme';

export const SERVICE_STEPS = ['סוג שירות', 'פרטים', 'מיקום ומועד', 'סיכום'] as const;
export function ServiceStepper({ step, onBack }: { step: number; onBack: () => void }) {
  return <View style={styles.header}>
    <View style={styles.row}>
      <IconButton accessibilityLabel="חזרה" icon={<Feather name="chevron-right" color={colors.ink} size={20} />} onPress={onBack} />
      <View><Text variant="caption">שלב {step + 1} / 4</Text><Text variant="screenTitle">{SERVICE_STEPS[step]}</Text></View>
    </View>
    <View accessibilityLabel={`שלב נוכחי: ${SERVICE_STEPS[step]}`} accessible style={styles.row}>
      {SERVICE_STEPS.map((label, index) => <View key={label} style={[styles.segment, { backgroundColor: index <= step ? colors.accent : colors.line }]} />)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  header: { gap: spacing.md, padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  segment: { height: 4, borderRadius: 2, flex: 1 },
});

import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme';
import { formatDateTime } from '../machines/warranty';
import type { ServiceRequest } from './api';
import { serviceStatusLabels } from './status';
import { serviceProgressSteps } from './serviceProgress';

export function ServiceProgress({ request }: { request: ServiceRequest }) {
  const steps = serviceProgressSteps(request);
  return <View style={{ gap: spacing.lg }}>
    <Text align="start" variant="sectionTitle">מעקב התקדמות</Text>
    <View accessibilityRole="list">
      {steps.map((entry, index, all) => <View key={entry.key} style={styles.row}>
        <View style={styles.rail}>
          <View testID={`progress-${entry.phase}`} style={[styles.dot, { backgroundColor: entry.phase === 'done' ? colors.ink : entry.phase === 'current' || entry.phase === 'rejected' ? colors.accent : colors.card }]}>
            {entry.phase === 'rejected' ? <Feather name="x" size={13} color={colors.cream} /> : entry.phase === 'done' ? <Feather name="check" size={13} color={colors.cream} /> : entry.phase === 'current' ? <View style={styles.inner} /> : null}
          </View>
          {index < all.length - 1 ? <View style={[styles.line, { backgroundColor: entry.phase === 'done' ? colors.ink : colors.line }]} /> : null}
        </View>
        <View style={styles.copy}>
          <Text align="start" testID="service-milestone-label" variant="sectionTitle" color={entry.phase === 'future' ? colors.ink3 : colors.ink}>{entry.label}</Text>
          {entry.detail ? <Text align="start" variant="caption" color={colors.accentDeep}>{entry.detail}</Text> : null}
          {entry.timestamp ? <Text align="start" variant="caption" color={colors.ink3}>{formatDateTime(entry.timestamp)}</Text> : null}
          {entry.staffName ? <Text align="start" testID="milestone-staff" variant="caption" color={colors.ink3}>{entry.staffName}</Text> : null}
          {entry.phase === 'current' ? <Text align="start" variant="caption" color={colors.ink3}>עכשיו</Text> : null}
        </View>
      </View>)}
    </View>
    <Text align="start" variant="caption" color={colors.ink3} accessibilityLiveRegion="polite">{serviceStatusLabels[request.state]}</Text>
  </View>;
}
const styles = StyleSheet.create({
  row: { direction: 'rtl', flexDirection: 'row', gap: spacing.md },
  rail: { alignItems: 'center', width: 24 },
  dot: { width: 23, height: 23, borderRadius: 12, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center' },
  inner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.cream },
  line: { width: 1, minHeight: 20, flex: 1 },
  copy: { flex: 1, gap: 2, paddingBottom: spacing.lg },
});

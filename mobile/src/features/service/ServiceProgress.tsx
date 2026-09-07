import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { colors, spacing } from '../../theme';
import { formatDateTime } from '../machines/warranty';
import type { ServiceRequest } from './api';
import { serviceStatusLabels, serviceTimeline } from './status';

export function ServiceProgress({ request }: { request: ServiceRequest }) {
  const actual = serviceTimeline(request).map(entry => ({ ...entry, label:
    entry.label === serviceStatusLabels.awaiting_intake_review && request.state !== 'awaiting_intake_review' ? 'בקשה נשלחה'
      : entry.label === serviceStatusLabels.awaiting_diagnostic_payment && request.history.some(event => event.created_at === entry.timestamp && event.from_state === 'awaiting_intake_review') ? 'אגרת אבחון נקבעה' : entry.label,
  }));
  if (actual.at(-1)?.label !== serviceStatusLabels[request.state]) {
    actual.push({ key: 'current-state', label: serviceStatusLabels[request.state], timestamp: request.updated_at });
  }
  const terminal = request.state === 'completed' || request.state === 'cancelled';
  const beforeArrival = ['awaiting_intake_review', 'awaiting_diagnostic_payment', 'awaiting_admin_review', 'scheduled'].includes(request.state);
  const beforeRepair = beforeArrival || request.state === 'received';
  const future = terminal ? [] : [
    ...(beforeArrival ? [request.location_mode === 'pickup' ? 'איסוף' : 'הבאה לחנות'] : []),
    ...(beforeRepair ? ['אבחון ותיקון'] : []),
    ...(request.state !== 'ready_for_return' ? ['החזרה'] : []),
  ];
  return <View style={{ gap: spacing.lg }}>
    <Text align="start" variant="sectionTitle">מעקב התקדמות</Text>
    <View accessibilityRole="list">
      {[...actual.map((entry, index) => ({ ...entry, phase: index === actual.length - 1 && !terminal ? 'current' : 'done' })), ...future.map(label => ({ key: `future-${label}`, label, timestamp: null, phase: 'future' }))].map((entry, index, all) => <View key={entry.key} style={styles.row}>
        <View style={styles.rail}>
          <View testID={`progress-${entry.phase}`} style={[styles.dot, { backgroundColor: entry.phase === 'done' ? colors.ink : entry.phase === 'current' ? colors.accent : colors.card }]}>
            {entry.phase === 'done' ? <Feather name="check" size={13} color={colors.cream} /> : entry.phase === 'current' ? <View style={styles.inner} /> : null}
          </View>
          {index < all.length - 1 ? <View style={[styles.line, { backgroundColor: entry.phase === 'done' ? colors.ink : colors.line }]} /> : null}
        </View>
        <View style={styles.copy}>
          <Text align="start" testID={entry.phase === 'future' ? 'future-timeline-label' : 'timeline-label'} variant="sectionTitle" color={entry.phase === 'future' ? colors.ink3 : colors.ink}>{entry.label}</Text>
          {entry.timestamp ? <Text align="start" variant="caption" color={colors.ink3}>{formatDateTime(entry.timestamp)}</Text> : null}
          {entry.phase === 'current' ? <Text align="start" variant="caption" color={colors.ink3}>עכשיו</Text> : null}
        </View>
      </View>)}
    </View>
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

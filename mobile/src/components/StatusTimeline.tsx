import { StyleSheet, View } from 'react-native';

import { formatOrderTimestamp, type TimelineEntry } from '../features/orders/status';
import { colors, spacing } from '../theme';
import { Text } from './Text';

type StatusTimelineProps = {
  entries: TimelineEntry[];
};

export function StatusTimeline({ entries }: StatusTimelineProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <View accessibilityRole="list" style={styles.container}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const timestamp = formatOrderTimestamp(entry.timestamp);

        return (
          <View key={entry.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, isLast ? styles.dotCurrent : styles.dotDone]} />
              {isLast ? null : <View style={styles.connector} />}
            </View>
            <View style={styles.copy}>
              <Text
                color={isLast ? colors.ink : colors.ink2}
                testID="timeline-label"
                variant="sectionTitle"
              >
                {entry.label}
              </Text>
              {timestamp ? (
                <Text color={colors.ink3} variant="caption">{timestamp}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rail: {
    alignItems: 'center',
    width: 18,
  },
  dot: {
    borderRadius: 9,
    height: 18,
    marginTop: 2,
    width: 18,
  },
  dotDone: {
    backgroundColor: colors.ink,
  },
  dotCurrent: {
    backgroundColor: colors.accent,
  },
  connector: {
    backgroundColor: colors.line,
    flex: 1,
    minHeight: 20,
    width: 2,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
});

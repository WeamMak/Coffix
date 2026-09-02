import { StyleSheet } from 'react-native';

import { colors, spacing } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

type EmptyStateProps = {
  actionLabel?: string;
  description?: string;
  onAction?: () => void;
  title: string;
};

export function EmptyState({
  actionLabel,
  description,
  onAction,
  title,
}: EmptyStateProps) {
  return (
    <Card accessibilityLiveRegion="polite" style={styles.card}>
      <Text align="center" variant="sectionTitle">{title}</Text>
      {description ? (
        <Text align="center" color={colors.ink2}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button accessibilityLabel={actionLabel} onPress={onAction} size="medium" tone="soft">
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.md,
  },
});

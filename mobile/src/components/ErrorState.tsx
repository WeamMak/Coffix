import { StyleSheet } from 'react-native';

import { colors, spacing } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Card accessibilityLiveRegion="polite" style={styles.card}>
      <Text align="center" color={colors.accentDeep}>{message}</Text>
      <Button
        accessibilityLabel="ניסיון נוסף"
        onPress={onRetry}
        size="medium"
        tone="soft"
      >
        ניסיון נוסף
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.md,
  },
});

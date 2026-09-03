import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { CartButton } from './CartButton';

type CommerceHeaderProps = PropsWithChildren<{
  sessionScope: string;
}>;

export function CommerceHeader({ children, sessionScope }: CommerceHeaderProps) {
  return (
    <View style={styles.container}>
      <CartButton sessionScope={sessionScope} />
      <View style={styles.copy}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    direction: 'ltr',
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  copy: {
    direction: 'rtl',
    flex: 1,
    gap: spacing.xs,
  },
});

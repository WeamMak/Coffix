import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { NotificationButton } from './NotificationButton';
import { CartButton } from './CartButton';

type CommerceHeaderProps = PropsWithChildren<{
  sessionScope: string;
}>;

export function CommerceHeader({ children, sessionScope }: CommerceHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.copy}>{children}</View>
      <NotificationButton sessionScope={sessionScope} />
      <CartButton sessionScope={sessionScope} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    direction: 'rtl',
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

import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from '../platform/reducedMotion';
import { colors, spacing } from '../theme';
import { Text } from './Text';

export type ButtonTone = 'ink' | 'accent' | 'soft';
export type ButtonSize = 'large' | 'medium' | 'small';

export type ButtonProps = PropsWithChildren<
  Omit<PressableProps, 'children' | 'style'> & {
    fullWidth?: boolean;
    icon?: ReactNode;
    size?: ButtonSize;
    style?: StyleProp<ViewStyle>;
    tone?: ButtonTone;
  }
>;

const toneStyles: Record<ButtonTone, { backgroundColor: string; color: string }> = {
  ink: { backgroundColor: colors.ink, color: colors.cream },
  accent: { backgroundColor: colors.accent, color: colors.white },
  soft: { backgroundColor: colors.accentSoft, color: colors.ink },
};

export function Button({
  children,
  disabled = false,
  fullWidth = false,
  icon,
  size = 'large',
  style,
  tone = 'ink',
  ...props
}: ButtonProps) {
  const reducedMotion = useReducedMotion();
  const isDisabled = disabled === true;
  const toneStyle = toneStyles[tone];

  const label = (
    <Text style={{ flexShrink: 1 }} align="center" color={isDisabled ? colors.ink3 : toneStyle.color} variant="label">
      {children}
    </Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        {
          backgroundColor: isDisabled ? colors.line : toneStyle.backgroundColor,
          borderRadius: size === 'large' ? 28 : size === 'medium' ? 24 : 20,
        },
        fullWidth ? styles.fullWidth : undefined,
        pressed && !isDisabled ? [styles.pressed, reducedMotion ? { transform: [] } : undefined] : undefined,
        style,
      ]}
      {...props}
    >
      {icon ? <View style={styles.iconLabel}>{icon}{label}</View> : label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconLabel: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  large: {
    minHeight: 56,
  },
  medium: {
    minHeight: 48,
  },
  small: {
    minHeight: 44,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
});

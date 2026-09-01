import type { PropsWithChildren } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from '../theme';
import { Text } from './Text';

export type ButtonTone = 'ink' | 'accent' | 'soft';
export type ButtonSize = 'large' | 'medium' | 'small';

export type ButtonProps = PropsWithChildren<
  Omit<PressableProps, 'children' | 'style'> & {
    fullWidth?: boolean;
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
  size = 'large',
  style,
  tone = 'ink',
  ...props
}: ButtonProps) {
  const isDisabled = disabled === true;
  const toneStyle = toneStyles[tone];

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
        pressed && !isDisabled ? styles.pressed : undefined,
        style,
      ]}
      {...props}
    >
      <Text
        align="center"
        color={isDisabled ? colors.ink3 : toneStyle.color}
        variant="label"
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
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
    minHeight: 40,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
});

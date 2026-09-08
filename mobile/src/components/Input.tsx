import type { ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontFamilies, radii, spacing } from '../theme';
import { Text } from './Text';
import type { TypographyVariant } from '../theme';

export type InputProps = Omit<TextInputProps, 'style'> & {
  containerStyle?: StyleProp<ViewStyle>;
  digitsOnly?: boolean;
  direction?: 'rtl' | 'ltr';
  error?: string;
  label: string;
  labelVariant?: TypographyVariant;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function Input({
  accessibilityLabel,
  allowFontScaling = true,
  containerStyle,
  digitsOnly = false,
  direction = digitsOnly ? 'ltr' : 'rtl',
  error,
  label,
  labelVariant = 'caption',
  leading,
  keyboardType = 'default',
  inputMode,
  maxLength,
  maxFontSizeMultiplier = 2,
  onChangeText,
  trailing,
  ...props
}: InputProps) {
  return (
    <View style={containerStyle}>
      <Text color={colors.ink2} style={styles.label} variant={labelVariant}>
        {label}
      </Text>
      <View style={[styles.field, error ? styles.fieldError : undefined]}>
        {leading}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          allowFontScaling={allowFontScaling}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          keyboardType={digitsOnly ? 'number-pad' : keyboardType}
          inputMode={digitsOnly ? 'numeric' : inputMode}
          // Filter pasted text before applying the digit limit.
          maxLength={digitsOnly ? undefined : maxLength}
          onChangeText={digitsOnly ? value => onChangeText?.(value.replace(/[^0-9]/g, '').slice(0, maxLength)) : onChangeText}
          placeholderTextColor={colors.ink3}
          style={[
            styles.input,
            direction === 'ltr' ? styles.ltr : styles.rtl,
          ]}
          {...props}
        />
        {trailing}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" color={colors.accentDeep} style={styles.error} variant="caption">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  field: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.input,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingStart: spacing.lg,
    paddingEnd: spacing.lg,
  },
  fieldError: {
    borderColor: colors.accentDeep,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.sans.regular,
    fontSize: 15,
    minWidth: 0,
    paddingVertical: spacing.md,
  },
  rtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ltr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  error: {
    marginTop: spacing.xs,
  },
});

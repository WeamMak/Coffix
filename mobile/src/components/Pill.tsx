import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { Text } from './Text';

export type PillTone = 'neutral' | 'accent' | 'success';
export type PillProps = PropsWithChildren<ViewProps & { tone?: PillTone }>;

const toneStyles: Record<PillTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.chip, color: colors.ink2 },
  accent: { backgroundColor: colors.accentSoft, color: colors.accentDeep },
  success: { backgroundColor: 'rgba(122, 139, 94, 0.14)', color: colors.sage },
};

export function Pill({ children, style, tone = 'neutral', ...props }: PillProps) {
  const toneStyle = toneStyles[tone];

  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.backgroundColor }, style]} {...props}>
      <Text color={toneStyle.color} variant="caption">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});

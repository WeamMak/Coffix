import {
  Text as NativeText,
  type TextProps as NativeTextProps,
  type TextStyle,
} from 'react-native';

import {
  colors,
  fontFamilies,
  typography,
  type TypographyVariant,
} from '../theme';

type TextAlign = 'start' | 'center' | 'end';

export type TextProps = NativeTextProps & {
  align?: TextAlign;
  color?: string;
  maxFontSizeMultiplier?: number;
  variant?: TypographyVariant;
};

const textAlign: Record<TextAlign, TextStyle['textAlign']> = {
  start: 'left',
  center: 'center',
  end: 'right',
};

function fontFamilyFor(variant: TypographyVariant): string {
  const token = typography[variant];
  const weight = token.weight;

  if (token.family === 'serif') {
    return weight === '600' ? fontFamilies.serif.semiBold : fontFamilies.serif.regular;
  }

  return weight === '600' ? fontFamilies.sans.semiBold : fontFamilies.sans.regular;
}

export function Text({
  align = 'start',
  allowFontScaling = true,
  color = colors.ink,
  maxFontSizeMultiplier = 2,
  style,
  variant = 'body',
  ...props
}: TextProps) {
  const token = typography[variant];

  return (
    <NativeText
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        {
          color,
          fontFamily: fontFamilyFor(variant),
          fontSize: token.size,
          letterSpacing: 'letterSpacing' in token ? token.letterSpacing : undefined,
          lineHeight: token.lineHeight,
          textAlign: textAlign[align],
        },
        style,
      ]}
      {...props}
    />
  );
}

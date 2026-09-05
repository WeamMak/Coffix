export const fontFamilies = {
  sans: {
    light: 'Assistant_300Light',
    regular: 'Assistant_400Regular',
    medium: 'Assistant_500Medium',
    semiBold: 'Assistant_600SemiBold',
    bold: 'Assistant_700Bold',
  },
  serif: {
    regular: 'NotoSerifHebrew_400Regular',
    medium: 'NotoSerifHebrew_500Medium',
    semiBold: 'NotoSerifHebrew_600SemiBold',
    bold: 'NotoSerifHebrew_700Bold',
  },
  brand: {
    regular: 'Fraunces_400Regular',
    medium: 'Fraunces_500Medium',
    semiBold: 'Fraunces_600SemiBold',
    bold: 'Fraunces_700Bold',
  },
} as const;

export const typography = {
  display: { family: 'serif', size: 36, lineHeight: 42, weight: '400' },
  screenTitle: { family: 'serif', size: 22, lineHeight: 28, weight: '400' },
  sectionTitle: { family: 'serif', size: 18, lineHeight: 24, weight: '400' },
  body: { family: 'sans', size: 14, lineHeight: 21, weight: '400' },
  label: { family: 'sans', size: 14, lineHeight: 18, weight: '600' },
  caption: { family: 'sans', size: 12, lineHeight: 16, weight: '400' },
  captionStrong: { family: 'sans', size: 12, lineHeight: 16, weight: '600' },
  eyebrow: {
    family: 'sans',
    size: 10,
    lineHeight: 14,
    weight: '600',
    letterSpacing: 1.3,
  },
} as const;

export type TypographyVariant = keyof typeof typography;

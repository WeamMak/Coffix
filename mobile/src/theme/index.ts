import { colors } from './colors';
import { radii } from './radii';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { fontFamilies, typography } from './typography';

export { colors } from './colors';
export { radii } from './radii';
export { shadows } from './shadows';
export { spacing } from './spacing';
export { fontFamilies, typography } from './typography';
export type { TypographyVariant } from './typography';

export const theme = {
  colors,
  fontFamilies,
  radii,
  shadows,
  spacing,
  typography,
} as const;

import { he } from '../src/i18n/he';
import { initializeRTL, logicalSpacing } from '../src/platform/rtl';
import { colors, radii, shadows, spacing, typography } from '../src/theme';
import { I18nManager } from 'react-native';

describe('Warm & Artisanal theme', () => {
  it('exports the exact approved color palette', () => {
    expect(colors).toEqual({
      cream: '#FDFBF7',
      card: '#F5EFE6',
      chip: '#EADFCE',
      line: '#E5DBC9',
      ink: '#2B1810',
      ink2: '#5D4B3A',
      ink3: '#9A8A76',
      accent: '#C17A4A',
      accentDeep: '#8B4E28',
      accentSoft: '#F4E4D3',
      sage: '#7A8B5E',
      warn: '#C17A4A',
      white: '#FFFFFF',
    });
  });

  it('exports the approved type scale, spacing, radii, and elevation', () => {
    expect(typography.screenTitle).toEqual({
      family: 'serif',
      size: 22,
      lineHeight: 28,
      weight: '400',
    });
    expect(typography.body).toEqual({
      family: 'sans',
      size: 14,
      lineHeight: 21,
      weight: '400',
    });
    expect(spacing).toEqual({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      '2xl': 24,
      '3xl': 32,
      '4xl': 40,
      '5xl': 48,
    });
    expect(radii).toEqual({
      input: 14,
      card: 18,
      featured: 22,
      pill: 999,
    });
    expect(shadows.card).toMatchObject({ elevation: 1, shadowOpacity: 0.04 });
    expect(shadows.elevated).toMatchObject({ elevation: 3, shadowOpacity: 0.08 });
    expect(shadows.modal).toMatchObject({ elevation: 12, shadowOpacity: 0.15 });
  });

  it('exports the approved Hebrew tab copy', () => {
    expect(he.tabs).toEqual({
      home: 'בית',
      shop: 'חנות',
      service: 'שירות',
      orders: 'הזמנות',
      profile: 'פרופיל',
    });
  });
});

describe('RTL platform helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps logical spacing to direction-aware native properties', () => {
    expect(logicalSpacing({ start: 16, end: 8, top: 4, bottom: 12 })).toEqual({
      paddingStart: 16,
      paddingEnd: 8,
      paddingTop: 4,
      paddingBottom: 12,
    });
  });

  it('requests RTL before rendering when the runtime is still LTR', () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    const allowRTL = jest.spyOn(I18nManager, 'allowRTL').mockImplementation();
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation();

    expect(initializeRTL()).toBe(false);
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
  });

  it('does not mutate direction when the runtime is already RTL', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    const allowRTL = jest.spyOn(I18nManager, 'allowRTL').mockImplementation();
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation();

    expect(initializeRTL()).toBe(true);
    expect(allowRTL).not.toHaveBeenCalled();
    expect(forceRTL).not.toHaveBeenCalled();
  });
});

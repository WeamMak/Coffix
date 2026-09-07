import type { Stack } from 'expo-router/js-stack';
import type { ComponentProps } from 'react';
import { Animated, Easing, I18nManager } from 'react-native';
import { colors } from '../theme';

type StackOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;
const slide = { animation: 'timing', config: { duration: 280, easing: Easing.inOut(Easing.cubic) } } as const;

// Physical coordinates, independent of platform/RTL mirroring. On pop, the top
// card's progress runs 1 → 0; both cards share it and meet at the same edge.
export const stackTransitions = {
  animationTypeForReplace: 'pop',
  gestureDirection: I18nManager.isRTL ? 'horizontal' : 'horizontal-inverted',
  gestureEnabled: true,
  detachPreviousScreen: false,
  freezeOnBlur: false,
  cardOverlayEnabled: false,
  cardShadowEnabled: false,
  cardStyle: { backgroundColor: colors.cream },
  transitionSpec: { open: slide, close: slide },
  cardStyleInterpolator: ({ current, next, layouts: { screen } }) => ({
    cardStyle: {
      transform: [{
        translateX: Animated.add(
          current.progress.interpolate({ inputRange: [0, 1], outputRange: [-screen.width, 0], extrapolate: 'clamp' }),
          next ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, screen.width], extrapolate: 'clamp' }) : 0,
        ),
      }],
    },
  }),
} satisfies StackOptions;

import type { NativeStackNavigationOptions } from 'expo-router';
import { I18nManager, Platform } from 'react-native';

// iOS mirrors its horizontal animations in RTL; Android's named slides are physical.
// In both cases, a pop moves the departing page from right to left.
export const stackTransitions = {
  animation: Platform.OS === 'ios' && I18nManager.isRTL ? 'simple_push' : 'slide_from_left',
  animationTypeForReplace: 'pop',
  animationMatchesGesture: true,
} satisfies NativeStackNavigationOptions;

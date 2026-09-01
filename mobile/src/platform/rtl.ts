import { I18nManager, type ViewStyle } from 'react-native';

export type LogicalSpacing = {
  start?: number;
  end?: number;
  top?: number;
  bottom?: number;
};

export function logicalSpacing({
  start,
  end,
  top,
  bottom,
}: LogicalSpacing): ViewStyle {
  return {
    ...(start === undefined ? {} : { paddingStart: start }),
    ...(end === undefined ? {} : { paddingEnd: end }),
    ...(top === undefined ? {} : { paddingTop: top }),
    ...(bottom === undefined ? {} : { paddingBottom: bottom }),
  };
}

export function initializeRTL(): boolean {
  if (I18nManager.isRTL) {
    return true;
  }

  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  return false;
}

export const isRTL = I18nManager.isRTL;

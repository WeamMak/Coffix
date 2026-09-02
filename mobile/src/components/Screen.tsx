import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

export type ScreenProps = PropsWithChildren<
  Omit<ScrollViewProps, 'contentContainerStyle'> & {
    backgroundColor?: string;
    contentContainerStyle?: StyleProp<ViewStyle>;
    safeAreaEdges?: Edge[];
    scroll?: boolean;
  }
>;

export function Screen({
  backgroundColor = colors.cream,
  children,
  contentContainerStyle,
  safeAreaEdges,
  scroll = false,
  style,
  ...props
}: ScreenProps) {
  const contentStyle = [styles.content, style, contentContainerStyle];

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          {...props}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle} {...props}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingStart: spacing.xl,
    paddingEnd: spacing.xl,
  },
});

import type { PropsWithChildren, ReactNode } from 'react';
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
    footer?: ReactNode;
    header?: ReactNode;
    safeAreaEdges?: Edge[];
    scroll?: boolean;
  }
>;

export function Screen({
  backgroundColor = colors.cream,
  children,
  contentContainerStyle,
  footer,
  header,
  safeAreaEdges,
  scroll = false,
  style,
  ...props
}: ScreenProps) {
  const contentStyle = [styles.content, style, contentContainerStyle];

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor }]}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          style={styles.scroller}
          {...props}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle} {...props}>
          {children}
        </View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroller: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingStart: spacing.xl,
    paddingEnd: spacing.xl,
  },
});

import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Text } from '../../src/components/Text';
import { useSession } from '../../src/features/auth/useSession';
import { colors, spacing } from '../../src/theme';

export default function AuthIndexScreen() {
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/(tabs)/(home)');
      return;
    }

    if (status !== 'unauthenticated') {
      return;
    }

    const timer = setTimeout(() => {
      router.replace('/(auth)/welcome');
    }, 800);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.brand}>
        <Text color={colors.cream} style={styles.wordmark} variant="display">
          Coffix
        </Text>
        <Text color="rgba(245, 239, 230, 0.58)" style={styles.tagline}>
          קפה · מכונות · שירות
        </Text>
      </View>
      <View accessibilityLabel="טוען" accessibilityRole="progressbar" style={styles.loader}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
  },
  wordmark: {
    fontStyle: 'italic',
  },
  tagline: {
    fontStyle: 'italic',
    letterSpacing: 0.4,
    marginTop: spacing.md,
  },
  loader: {
    bottom: 72,
    flexDirection: 'row',
    gap: 6,
    position: 'absolute',
  },
  dot: {
    backgroundColor: 'rgba(245, 239, 230, 0.2)',
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
});

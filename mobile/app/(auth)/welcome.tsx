import { router } from 'expo-router';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../src/components/Button';
import { Text } from '../../src/components/Text';
import { colors, spacing } from '../../src/theme';

const WELCOME_IMAGE = {
  uri: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=1200&q=80',
};

export default function WelcomeScreen() {
  const openPhoneAuthentication = () => router.push('/(auth)/phone');

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ImageBackground
        accessibilityIgnoresInvertColors
        source={WELCOME_IMAGE}
        style={styles.hero}
      >
        <View style={styles.heroOverlay} />
        <SafeAreaView edges={['top']} style={styles.wordmarkArea}>
          <Text color={colors.cream} style={styles.wordmark} variant="screenTitle">
            Coffix
          </Text>
        </SafeAreaView>
      </ImageBackground>
      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <View style={styles.heading}>
          <Text color={colors.cream} variant="display">קפה מדויק.</Text>
          <Text color={colors.accent} variant="display">שירות שלם.</Text>
        </View>
        <Text color="rgba(245, 239, 230, 0.68)" style={styles.description}>
          מכונות אספרסו, פולים טריים וטכנאים שמגיעים אליך. הכול באפליקציה אחת.
        </Text>
        <Button fullWidth onPress={openPhoneAuthentication} tone="accent">
          התחלה
        </Button>
        <Pressable
          accessibilityRole="button"
          onPress={openPhoneAuthentication}
          style={styles.login}
        >
          <Text align="center" color="rgba(245, 239, 230, 0.72)">
            {'כבר יש לי חשבון · '}
            <Text color={colors.cream} variant="label">התחברות</Text>
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  hero: {
    height: '58%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(43, 24, 16, 0.32)',
  },
  wordmarkArea: {
    paddingStart: spacing.xl,
  },
  wordmark: {
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  panel: {
    backgroundColor: colors.ink,
    flex: 1,
    marginTop: -spacing['2xl'],
    paddingStart: spacing['2xl'],
    paddingEnd: spacing['2xl'],
    paddingTop: spacing['2xl'],
  },
  heading: {
    marginBottom: spacing.md,
  },
  description: {
    marginBottom: spacing['2xl'],
  },
  login: {
    minHeight: 48,
    paddingVertical: spacing.lg,
  },
});

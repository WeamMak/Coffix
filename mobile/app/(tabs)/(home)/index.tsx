import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { colors, spacing } from '../../../src/theme';

export default function AuthenticatedLandingScreen() {
  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.icon}>
        <Feather color={colors.cream} name="check" size={28} />
      </View>
      <Text align="center" variant="screenTitle">
        התחברת בהצלחה
      </Text>
      <Text align="center" color={colors.ink2}>
        ברוכים הבאים ל־Coffix
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 56,
  },
});

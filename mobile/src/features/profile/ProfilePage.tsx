import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { BackButton } from '../../components/BackButton';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { goBack } from '../../navigation/goBack';
import { spacing } from '../../theme';

export function ProfilePage({ title, children }: PropsWithChildren<{ title: string }>) {
  return <Screen scroll contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl, direction: 'rtl' }} header={
    <View style={{ flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: spacing.md, padding: spacing.xl }}>
      <BackButton onPress={() => goBack('/(tabs)/(profile)')} />
      <Text accessibilityRole="header" variant="screenTitle" style={{ flex: 1 }}>{title}</Text>
    </View>
  }>{children}</Screen>;
}

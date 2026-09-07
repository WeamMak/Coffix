import { Stack } from 'expo-router';

import { stackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...stackTransitions,
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    />
  );
}

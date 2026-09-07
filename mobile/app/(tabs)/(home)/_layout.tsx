import { Stack } from 'expo-router/js-stack';

import { stackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...stackTransitions,
        cardStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    />
  );
}

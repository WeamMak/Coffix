import { Stack } from 'expo-router/js-stack';

import { useStackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function HomeStackLayout() {
  const stackTransitions = useStackTransitions();
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

import { Stack } from 'expo-router/js-stack';

import { useStackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function OrdersStackLayout() {
  const stackTransitions = useStackTransitions();
  return (
    <Stack
      screenOptions={{
        ...stackTransitions,
        cardStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[orderId]" />
    </Stack>
  );
}

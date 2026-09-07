import { Stack } from 'expo-router';

import { stackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function OrdersStackLayout() {
  return (
    <Stack
      screenOptions={{
        ...stackTransitions,
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[orderId]" />
    </Stack>
  );
}

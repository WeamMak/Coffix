import { Stack } from 'expo-router/js-stack';

import { useStackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function ServiceStackLayout() {
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
      <Stack.Screen name="machines/[machineId]" />
      <Stack.Screen name="register" />
      <Stack.Screen name="request/machineId" />
      <Stack.Screen name="request/type" />
      <Stack.Screen name="request/issue" />
      <Stack.Screen name="request/location" />
      <Stack.Screen name="request/addresses" />
      <Stack.Screen name="request/address" />
      <Stack.Screen name="request/review" />
      <Stack.Screen name="request/confirmation" />
      <Stack.Screen name="requests/[requestId]" />
      <Stack.Screen name="requests/[requestId]/payment" />
    </Stack>
  );
}

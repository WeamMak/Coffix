import { Stack } from 'expo-router';

import { colors } from '../../../src/theme';

export default function ServiceStackLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_left',
        contentStyle: { backgroundColor: colors.cream },
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
      <Stack.Screen name="request/review" />
      <Stack.Screen name="request/confirmation" />
      <Stack.Screen name="requests/[requestId]" />
    </Stack>
  );
}

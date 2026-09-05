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
    </Stack>
  );
}

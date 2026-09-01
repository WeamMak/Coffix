import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    />
  );
}

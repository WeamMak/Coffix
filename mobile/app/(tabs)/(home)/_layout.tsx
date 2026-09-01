import { Stack } from 'expo-router';

import { colors } from '../../../src/theme';

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_left',
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    />
  );
}

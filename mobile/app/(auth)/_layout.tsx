import { Redirect, Stack } from 'expo-router';

import { useSession } from '../../src/features/auth/useSession';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  const { status } = useSession();

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/(home)" />;
  }

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

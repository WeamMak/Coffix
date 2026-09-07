import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useSession } from '../../src/features/auth/useSession';
import { useStackTransitions } from '../../src/navigation/stackTransitions';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  const stackTransitions = useStackTransitions();
  const { status } = useSession();

  if (status === 'authenticated') {
    return <Redirect href="/(tabs)/(home)" />;
  }

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

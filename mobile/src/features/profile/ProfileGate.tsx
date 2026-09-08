import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { spacing } from '../../theme';
import { useSession } from '../auth/useSession';
import { profileApi } from './api';
import { PersonalDetails } from './PersonalDetails';

export function ProfileGate({ children }: PropsWithChildren) {
  const { sessionScope, status, logout } = useSession();
  const profile = useQuery({ queryKey: ['private', sessionScope, 'profile'], queryFn: profileApi.get, enabled: status === 'authenticated' && !!sessionScope });
  if (status === 'unauthenticated') return <>{children}</>;
  if (status === 'authenticated' && profile.data?.profile_complete) return <>{children}</>;
  return <Screen scroll contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.xl, direction: 'rtl' }}>
    {status === 'loading' || profile.isPending ? <ActivityIndicator accessibilityLabel="טוענים פרופיל" /> : profile.isError ? <>
      <Text>לא הצלחנו לטעון את הפרופיל.</Text><Button onPress={() => void profile.refetch()}>ניסיון נוסף</Button>
    </> : <>
      <Text variant="screenTitle" accessibilityRole="header">השלמת פרטים אישיים</Text>
      <PersonalDetails key={sessionScope} profile={profile.data} sessionScope={sessionScope ?? ''} onboarding />
    </>}
    {status === 'authenticated' ? <Button tone="soft" onPress={() => { void logout().catch(() => {}); }}>יציאה</Button> : null}
  </Screen>;
}

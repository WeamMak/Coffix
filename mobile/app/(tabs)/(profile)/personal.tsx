import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { profileApi } from '../../../src/features/profile/api';
import { PersonalDetails } from '../../../src/features/profile/PersonalDetails';
import { ProfilePage } from '../../../src/features/profile/ProfilePage';

export default function PersonalRoute() {
  const { sessionScope } = useSession();
  const profile = useQuery({ queryKey: ['private', sessionScope, 'profile'], queryFn: profileApi.get });
  return <ProfilePage title="פרטים אישיים">
    {profile.isPending ? <ActivityIndicator accessibilityLabel="טוענים פרטים אישיים" /> : profile.isError ? <>
      <Text>לא הצלחנו לטעון את הפרטים.</Text><Button onPress={() => void profile.refetch()}>ניסיון נוסף</Button>
    </> : <PersonalDetails key={sessionScope} profile={profile.data} sessionScope={sessionScope ?? ''} />}
  </ProfilePage>;
}

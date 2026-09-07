import { router, type Href } from 'expo-router';
import { Button } from '../../../../src/components/Button';
import { ErrorState } from '../../../../src/components/ErrorState';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { useMachines } from '../../../../src/features/machines/queries';
import { intakeRoute } from '../../../../src/features/service/IntakeScreen';
import { spacing } from '../../../../src/theme';

export default function SelectMachineScreen() {
  const { sessionScope } = useSession();
  const query = useMachines(sessionScope ?? '');
  return <Screen scroll contentContainerStyle={{ gap: spacing.lg }}>
    <Text variant="screenTitle">בחירת מכונה לשירות</Text>
    {query.isPending ? <Text>טוענים מכונות</Text> : null}
    {query.isError ? <ErrorState message="לא הצלחנו לטעון מכונות" onRetry={() => void query.refetch()} /> : null}
    {query.data?.length === 0 ? <><Text>יש לרשום מכונה לפני בקשת שירות.</Text><Button onPress={() => router.push('/(tabs)/(service)/register' as Href)}>רישום מכונה</Button></> : null}
    {query.data?.map(machine => <Button key={machine.id} onPress={() => router.push(intakeRoute(0, machine.id))}>{`${machine.model.manufacturer} ${machine.model.model_name}`}</Button>)}
    <Button tone="soft" onPress={() => router.replace('/(tabs)/(service)' as Href)}>חזרה למכונות שלי</Button>
  </Screen>;
}

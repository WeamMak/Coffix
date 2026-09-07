import { Stack } from 'expo-router/js-stack';
import { useStackTransitions } from '../../../src/navigation/stackTransitions';

export default function ProfileStackLayout() {
  const transitions = useStackTransitions();
  return <Stack screenOptions={{ ...transitions, headerShown: false }} />;
}

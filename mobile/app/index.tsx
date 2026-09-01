import { Redirect } from 'expo-router';

export default function IndexRoute() {
  return <Redirect href={__DEV__ ? '/gallery' : '/(auth)'} />;
}

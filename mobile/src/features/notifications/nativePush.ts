import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import type { PushDevice } from './push';

export async function loadPushDevice(): Promise<PushDevice | null> {
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  const fcm = await import('@react-native-firebase/messaging');
  const messaging = fcm.getMessaging();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return {
    platform,
    async permission() {
      if (platform === 'android') {
        if (Number(Platform.Version) < 33) return true;
        return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) === PermissionsAndroid.RESULTS.GRANTED;
      }
      const status = await fcm.requestPermission(messaging);
      return status === fcm.AuthorizationStatus.AUTHORIZED || status === fcm.AuthorizationStatus.PROVISIONAL;
    },
    token: () => fcm.getToken(messaging),
    deleteToken: () => fcm.deleteToken(messaging),
    subscribe(message, rotated) {
      const subscriptions = [
        fcm.onMessage(messaging, value => { message(value.data, false); }),
        fcm.onNotificationOpenedApp(messaging, value => { message(value.data, true); }),
        fcm.onTokenRefresh(messaging, rotated),
      ];
      return () => subscriptions.forEach(remove => remove());
    },
    async initial() { return (await fcm.getInitialNotification(messaging))?.data; },
  };
}

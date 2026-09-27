import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import type { PushDevice } from './push';

// Permission belongs to the device, not the signed-in account. Returning from
// Android's prompt emits AppState 'active' and recreates the push session.
let androidPermissionRequested = false;
export async function androidNotificationPermission(): Promise<boolean> {
  if (Number(Platform.Version) < 33) return true;
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  if (granted || androidPermissionRequested) return granted;
  androidPermissionRequested = true;
  return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) === PermissionsAndroid.RESULTS.GRANTED;
}

export async function loadPushDevice(): Promise<PushDevice | null> {
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  const fcm = await import('@react-native-firebase/messaging');
  const messaging = fcm.getMessaging();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return {
    platform,
    async permission() {
      if (platform === 'android') {
        return androidNotificationPermission();
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

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Coffix',
  slug: config.slug ?? 'coffix',
  ios: { ...config.ios, entitlements: { ...config.ios?.entitlements, 'aps-environment': config.ios?.entitlements?.['aps-environment'] ?? 'development' }, infoPlist: { ...config.ios?.infoPlist, UIBackgroundModes: ['remote-notification'] }, ...(process.env.FIREBASE_IOS_CONFIG ? { googleServicesFile: process.env.FIREBASE_IOS_CONFIG } : {}) },
  android: { ...config.android, ...(process.env.FIREBASE_ANDROID_CONFIG ? { googleServicesFile: process.env.FIREBASE_ANDROID_CONFIG } : {}) },
  plugins: [
    ...(config.plugins ?? []).filter(plugin => plugin !== 'expo-build-properties'),
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
});

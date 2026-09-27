import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = process.env;
  const profile = env.EAS_BUILD_PROFILE;
  const projectId = env.EAS_PROJECT_ID;
  const owner = env.EXPO_OWNER;
  const buildSha = env.COFFIX_BUILD_SHA ?? env.EAS_BUILD_GIT_COMMIT_HASH;
  if (profile) {
    if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('Set EAS_PROJECT_ID to the linked Expo project UUID');
    if (!owner) throw new Error('Set EXPO_OWNER to the Expo account or organization');
    if (!buildSha || !/^[0-9a-f]{40}$/.test(buildSha)) throw new Error('Set COFFIX_BUILD_SHA to the source Git SHA');
    const apiUrl = env.EXPO_PUBLIC_API_URL;
    if (!apiUrl || (profile !== 'development' && !apiUrl.startsWith('https://'))) throw new Error('Release builds require an explicit HTTPS EXPO_PUBLIC_API_URL');
    const payment = env.EXPO_PUBLIC_PAYMENT_PROVIDER;
    if (payment !== 'fake' && payment !== 'stripe') throw new Error('Set EXPO_PUBLIC_PAYMENT_PROVIDER');
    if (profile === 'production' && payment !== 'stripe') throw new Error('Production requires Stripe');
    if (payment === 'stripe') {
      const prefix = profile === 'production' ? 'pk_live_' : 'pk_test_';
      if (!env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith(prefix)) throw new Error(`Stripe publishable key must start with ${prefix}`);
    }
  }
  return {
    ...config,
    name: config.name ?? 'Coffix',
    slug: config.slug ?? 'coffix',
    ...(owner ? { owner } : {}),
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
      ...(buildSha ? { buildSha } : {}),
    },
    ios: {
      ...config.ios,
      entitlements: {
        ...config.ios?.entitlements,
        'aps-environment': profile ? 'production' : (config.ios?.entitlements?.['aps-environment'] ?? 'development'),
      },
      infoPlist: { ...config.ios?.infoPlist, UIBackgroundModes: ['remote-notification'] },
      ...(env.FIREBASE_IOS_CONFIG ? { googleServicesFile: env.FIREBASE_IOS_CONFIG } : {}),
    },
    android: {
      ...config.android,
      ...(env.FIREBASE_ANDROID_CONFIG ? { googleServicesFile: env.FIREBASE_ANDROID_CONFIG } : {}),
    },
    plugins: [
      ...(config.plugins ?? []).filter(plugin => plugin !== 'expo-build-properties'),
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
    ],
  };
};

import { createApiClient, createAuthApi } from '@coffix/api-client';
import { Platform } from 'react-native';

import { secureTokenStore } from '../features/auth/store';
import { resolveApiBaseUrl } from './baseUrl';
export { resolveApiBaseUrl } from './baseUrl';

export const apiBaseUrl = resolveApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
});

const refreshClient = createApiClient({
  baseUrl: apiBaseUrl,
  tokenStore: secureTokenStore,
});
const refreshApi = createAuthApi(refreshClient);

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  refreshTokens: async () => {
    const refreshToken = await secureTokenStore.getRefreshToken();
    return refreshToken ? refreshApi.refresh(refreshToken) : null;
  },
  tokenStore: secureTokenStore,
});

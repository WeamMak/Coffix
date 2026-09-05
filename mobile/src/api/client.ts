import { createApiClient, createAuthApi } from '@coffix/api-client';
import { Platform } from 'react-native';

import { secureTokenStore } from '../features/auth/store';

type ApiBaseUrlOptions = {
  configuredUrl?: string;
  platform: string;
};

export function resolveApiBaseUrl({
  configuredUrl,
  platform,
}: ApiBaseUrlOptions): string {
  const fallback = platform === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

  return (configuredUrl || fallback).replace(/\/+$/, '');
}

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

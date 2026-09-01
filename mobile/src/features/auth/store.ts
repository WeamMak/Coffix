import * as SecureStore from 'expo-secure-store';

import type { AuthTokens, TokenStore } from '@coffix/api-client';

const ACCESS_TOKEN_KEY = 'coffix.accessToken';
const REFRESH_TOKEN_KEY = 'coffix.refreshToken';

export type AuthTokenStore = TokenStore & {
  getRefreshToken(): Promise<string | null>;
  subscribeToClear(listener: () => void): () => void;
};

const clearListeners = new Set<() => void>();

export const secureTokenStore: AuthTokenStore = {
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    clearListeners.forEach((listener) => listener());
  },
  getAccessToken() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setTokens(tokens: AuthTokens) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token),
    ]);
  },
  subscribeToClear(listener: () => void) {
    clearListeners.add(listener);
    return () => {
      clearListeners.delete(listener);
    };
  },
};

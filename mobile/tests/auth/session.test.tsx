import { createApiClient, type AuthTokens, type TokenStore } from '@coffix/api-client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Button, Text, View } from 'react-native';

import AuthIndexScreen from '../../app/(auth)/index';
import { queryClient } from '../../src/api/queryClient';
import {
  AuthSessionProvider,
  useSession,
} from '../../src/features/auth/useSession';
import { secureTokenStore } from '../../src/features/auth/store';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    headers: new Headers({ 'X-Correlation-ID': 'session-correlation' }),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function SessionHarness() {
  const { logout, status } = useSession();
  return (
    <View>
      <Text>{status}</Text>
      <Button onPress={logout} title="יציאה" />
    </View>
  );
}

describe('mobile session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the branded splash while resolving a signed-out session', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    await render(
      <AuthSessionProvider>
        <AuthIndexScreen />
      </AuthSessionProvider>,
    );

    expect(screen.getByText('Coffix')).toBeOnTheScreen();
    expect(screen.getByText('קפה · מכונות · שירות')).toBeOnTheScreen();
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
    }, { timeout: 1_200 });
  });

  it('refreshes and securely persists rotated tokens during boot', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => (
      key === 'coffix.refreshToken' ? 'stored-refresh' : 'stored-access'
    ));
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      token_type: 'bearer',
    }));

    await render(
      <AuthSessionProvider>
        <SessionHarness />
        <AuthIndexScreen />
      </AuthSessionProvider>,
    );

    expect(await screen.findByText('authenticated')).toBeOnTheScreen();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/auth\/refresh$/),
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: 'stored-refresh' }),
      }),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'coffix.refreshToken',
      'rotated-refresh',
    );
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });

  it('shares one rotating-token refresh across concurrent boot effects', async () => {
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => (
      key === 'coffix.refreshToken' ? 'stored-refresh' : 'stored-access'
    ));
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      token_type: 'bearer',
    }));

    await render(
      <>
        <AuthSessionProvider>
          <SessionHarness />
        </AuthSessionProvider>
        <AuthSessionProvider>
          <SessionHarness />
        </AuthSessionProvider>
      </>,
    );

    expect(await screen.findAllByText('authenticated')).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['refresh_token_expired', 'session_revoked'])(
    'clears local credentials when boot refresh returns %s',
    async (code) => {
      jest.mocked(SecureStore.getItemAsync).mockResolvedValue('stored-refresh');
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({
        code,
        status: 401,
        title: 'Invalid session',
        type: 'about:blank',
      }, 401));

      await render(
        <AuthSessionProvider>
          <SessionHarness />
        </AuthSessionProvider>,
      );

      expect(await screen.findByText('unauthenticated')).toBeOnTheScreen();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('coffix.accessToken');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('coffix.refreshToken');
    },
  );

  it('clears credentials and query data during logout', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('stored-refresh');
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        token_type: 'bearer',
      }))
      .mockResolvedValueOnce({
        headers: new Headers(),
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);
    const clearQueries = jest.spyOn(queryClient, 'clear');
    await render(
      <AuthSessionProvider>
        <SessionHarness />
      </AuthSessionProvider>,
    );
    await screen.findByText('authenticated');

    await fireEvent.press(screen.getByRole('button', { name: 'יציאה' }));

    await waitFor(() => {
      expect(screen.getByText('unauthenticated')).toBeOnTheScreen();
      expect(clearQueries).toHaveBeenCalledTimes(1);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    });
  });

  it('becomes signed out when the transport clears a revoked session', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('stored-refresh');
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      token_type: 'bearer',
    }));
    await render(
      <AuthSessionProvider>
        <SessionHarness />
      </AuthSessionProvider>,
    );
    await screen.findByText('authenticated');

    await act(async () => {
      await secureTokenStore.clear();
    });

    expect(screen.getByText('unauthenticated')).toBeOnTheScreen();
  });
});

describe('authenticated API transport', () => {
  it('refreshes once after 401 and never enters a retry loop', async () => {
    let accessToken = 'expired-access';
    const tokenStore: TokenStore = {
      clear: jest.fn().mockResolvedValue(undefined),
      getAccessToken: jest.fn(async () => accessToken),
      setTokens: jest.fn(async (tokens: AuthTokens) => {
        accessToken = tokens.access_token;
      }),
    };
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401));
    const refreshTokens = jest.fn().mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'bearer',
    } satisfies AuthTokens);
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetcher,
      refreshTokens,
      tokenStore,
    });

    await expect(client.request('/protected')).rejects.toMatchObject({
      problem: { status: 401 },
    });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer new-access' }),
    });
  });

  it('clears credentials when refresh is expired or revoked', async () => {
    const tokenStore: TokenStore = {
      clear: jest.fn().mockResolvedValue(undefined),
      getAccessToken: jest.fn().mockResolvedValue('expired-access'),
      setTokens: jest.fn().mockResolvedValue(undefined),
    };
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: jest.fn().mockResolvedValue(jsonResponse({ code: 'unauthorized' }, 401)),
      refreshTokens: jest.fn().mockRejectedValue(new Error('session revoked')),
      tokenStore,
    });

    await expect(client.request('/protected')).rejects.toThrow('session revoked');
    expect(tokenStore.clear).toHaveBeenCalledTimes(1);
  });
});

import type { AuthTokens } from './auth';

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  correlationId: string;
  errors?: Record<string, string[]>;
};

export interface TokenStore {
  getAccessToken(): Promise<string | null>;
  setTokens(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export class ApiClientError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiClientError';
  }
}

type RequestOptions = {
  authenticated?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
};

type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  refreshTokens?: () => Promise<AuthTokens | null>;
  tokenStore: TokenStore;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

function problemFrom(response: Response, payload: unknown): ApiProblem {
  const value = typeof payload === 'object' && payload !== null
    ? payload as Partial<ApiProblem>
    : {};

  return {
    type: typeof value.type === 'string' ? value.type : 'about:blank',
    title: typeof value.title === 'string' ? value.title : 'Request failed',
    status: response.status,
    code: typeof value.code === 'string' ? value.code : 'unexpected_error',
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    correlationId: typeof value.correlationId === 'string'
      ? value.correlationId
      : response.headers.get('x-correlation-id') ?? 'unknown',
    errors: value.errors,
  };
}

async function responsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function send<T>(
    path: string,
    requestOptions: RequestOptions,
    allowRefresh: boolean,
  ): Promise<T> {
    const authenticated = requestOptions.authenticated ?? true;
    const accessToken = authenticated
      ? await options.tokenStore.getAccessToken()
      : null;
    const fetcher = options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${baseUrl}${path}`, {
      body: requestOptions.body === undefined
        ? undefined
        : JSON.stringify(requestOptions.body),
      headers: {
        Accept: 'application/json',
        ...(requestOptions.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...requestOptions.headers,
      },
      method: requestOptions.method ?? 'GET',
    });

    if (
      response.status === 401
      && authenticated
      && allowRefresh
      && options.refreshTokens
    ) {
      let tokens: AuthTokens | null;
      try {
        tokens = await options.refreshTokens();
      } catch (error) {
        await options.tokenStore.clear();
        throw error;
      }
      if (tokens) {
        await options.tokenStore.setTokens(tokens);
        return send<T>(path, requestOptions, false);
      }
      await options.tokenStore.clear();
    }

    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ApiClientError(problemFrom(response, payload));
    }

    return payload as T;
  }

  return {
    request<T>(path: string, requestOptions: RequestOptions = {}) {
      return send<T>(path, requestOptions, true);
    },
  };
}

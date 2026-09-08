import { ApiClientError, type ApiProblem } from '@coffix/api-client';

export function problemFrom(response: Response, payload: unknown): ApiClientError {
  const value = typeof payload === 'object' && payload !== null ? payload as Partial<ApiProblem> : {};
  return new ApiClientError({
    type: typeof value.type === 'string' ? value.type : 'about:blank',
    status: response.status,
    title: typeof value.title === 'string' ? value.title : 'Request failed',
    code: typeof value.code === 'string' ? value.code : 'unexpected_error',
    detail: typeof value.detail === 'string' ? value.detail : undefined,
    correlationId: typeof value.correlationId === 'string'
      ? value.correlationId : response.headers.get('X-Correlation-ID') ?? 'unknown',
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to connect. Please try again.';
}

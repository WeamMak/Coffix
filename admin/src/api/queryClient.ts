import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '@coffix/api-client';

export function createQueryClient() {
  return new QueryClient({ defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => count < 1 && !(error instanceof ApiClientError && error.problem.status < 500),
    },
    mutations: { retry: false },
  } });
}

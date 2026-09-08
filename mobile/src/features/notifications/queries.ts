import { type QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { notificationsApi } from './api';

export const notificationKeys = {
  all: (scope: string) => ['private', scope, 'notifications'] as const,
  list: (scope: string) => [...notificationKeys.all(scope), 'list'] as const,
  unread: (scope: string) => [...notificationKeys.all(scope), 'unread'] as const,
};
export function useUnreadNotifications(scope: string) {
  return useQuery({ queryKey: notificationKeys.unread(scope), queryFn: notificationsApi.unread, enabled: Boolean(scope), refetchInterval: 30_000 });
}
export function useNotifications(scope: string) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(scope), queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: 0, getNextPageParam: (last, pages) => last.length === 50 ? pages.length * 50 : undefined,
    enabled: Boolean(scope), staleTime: 0,
  });
}
export async function refreshNotifications(client: QueryClient, scope: string) {
  await client.invalidateQueries({ queryKey: notificationKeys.all(scope) });
}

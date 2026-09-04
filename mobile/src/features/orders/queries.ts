import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ordersApi } from './api';

// `detail` intentionally matches the shape of `cartKeys.order` in the cart
// feature so the checkout confirmation screen and this screen share one cache
// entry for a given order.
export const orderKeys = {
  detail: (scope: string, orderId: string) => [
    'private', scope, 'orders', orderId,
  ] as const,
  list: (scope: string) => ['private', scope, 'orders', 'list'] as const,
};

// Order state changes server-side (payment, fulfilment, refunds); always treat
// cached order data as stale so navigating back to a screen shows current data.
export function useOrders(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => ordersApi.list(),
    queryKey: orderKeys.list(scope),
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useOrder(scope: string, orderId: string) {
  return useQuery({
    enabled: Boolean(scope && orderId),
    queryFn: () => ordersApi.get(orderId),
    queryKey: orderKeys.detail(scope, orderId),
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

/** Refetch a query whenever the screen regains focus; complements pull-to-refresh. */
export function useRefetchOnFocus(refetch: () => unknown): void {
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
}

/**
 * Invalidates the order list and the given order details. The mobile
 * notification system (plan.md Task 24 — "uses push payloads only as
 * invalidation hints") will call this with the changed order IDs from a push
 * payload. Until that lands, screens stay current via `useRefetchOnFocus` and
 * pull-to-refresh; this helper is the integration point, not dead code.
 */
export function invalidateOrders(
  client: QueryClient,
  scope: string,
  orderIds: readonly string[] = [],
): void {
  void client.invalidateQueries({ queryKey: orderKeys.list(scope) });
  for (const orderId of orderIds) {
    void client.invalidateQueries({ queryKey: orderKeys.detail(scope, orderId) });
  }
}

import { type QueryClient, useQuery } from '@tanstack/react-query';

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

export function useOrders(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => ordersApi.list(),
    queryKey: orderKeys.list(scope),
  });
}

export function useOrder(scope: string, orderId: string) {
  return useQuery({
    enabled: Boolean(scope && orderId),
    queryFn: () => ordersApi.get(orderId),
    queryKey: orderKeys.detail(scope, orderId),
  });
}

/**
 * Refreshes the order list and any affected order details. A push-notification
 * handler (Task 25) calls this when the backend reports changed order IDs; it
 * complements, and never replaces, pull-to-refresh.
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

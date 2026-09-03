import { ApiClientError } from '@coffix/api-client';
import { useQuery } from '@tanstack/react-query';

import { cartApi, type Order } from './api';

export const cartKeys = {
  cart: (scope: string) => ['private', scope, 'cart'] as const,
  checkout: (scope: string, checkoutKey: string) => [
    'private', scope, 'checkout', checkoutKey,
  ] as const,
  order: (scope: string, orderId: string) => [
    'private', scope, 'orders', orderId,
  ] as const,
};

export function isCartExpiredError(error: unknown): boolean {
  return error instanceof ApiClientError && error.problem.code === 'CART_EXPIRED';
}

export function isVerifiedOrder(order: Order | undefined): boolean {
  return order?.state === 'paid'
    || order?.state === 'processing'
    || order?.state === 'shipped'
    || order?.state === 'delivered';
}

export function useCart(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => cartApi.get(),
    queryKey: cartKeys.cart(scope),
    refetchOnMount: false,
  });
}

export function useOrder(
  scope: string,
  orderId: string,
  poll = false,
  pollIntervalMs = 2_000,
) {
  return useQuery({
    enabled: Boolean(scope && orderId),
    queryFn: () => cartApi.getOrder(orderId),
    queryKey: cartKeys.order(scope, orderId),
    refetchInterval: (query) => (
      poll && (query.state.data as Order | undefined)?.state === 'pending_payment'
        ? pollIntervalMs
        : false
    ),
  });
}

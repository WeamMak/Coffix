import { ApiClientError } from '@coffix/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { cartApi, type Cart } from './api';
import { cartKeys } from './queries';

type CartAction =
  | { kind: 'remove' }
  | { kind: 'set'; quantity: number };

type QueueEntry = {
  confirmed: Cart | undefined;
  latest: CartAction | null;
};

function optimisticCart(
  cart: Cart | undefined,
  skuId: string,
  action: CartAction,
): Cart | undefined {
  if (!cart) {
    return cart;
  }
  const items = action.kind === 'remove'
    ? cart.items.filter((item) => item.sku_id !== skuId)
    : cart.items.map((item) => item.sku_id === skuId
      ? {
          ...item,
          line_total_agorot: item.unit_price_agorot * action.quantity,
          quantity: action.quantity,
        }
      : item);
  return {
    ...cart,
    items,
    subtotal_agorot: items.reduce((total, item) => total + item.line_total_agorot, 0),
    total_quantity: items.reduce((total, item) => total + item.quantity, 0),
  };
}

function priceChanged(previous: Cart | undefined, next: Cart): boolean {
  if (!previous) {
    return false;
  }
  const prices = new Map(previous.items.map((item) => [
    item.sku_id,
    item.unit_price_agorot,
  ]));
  return next.items.some((item) => prices.get(item.sku_id) !== item.unit_price_agorot);
}

function cartMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.problem.code === 'INSUFFICIENT_STOCK') {
      return 'אין מספיק מלאי לכמות שבחרתם. הסל עודכן.';
    }
    if (error.problem.code === 'CART_EXPIRED') {
      return 'תוקף שמירת הסל הסתיים. טענו עבורכם סל עדכני.';
    }
  }
  return 'לא הצלחנו לעדכן את הסל. הסל נטען מחדש.';
}

export function useCartMutations(scope: string) {
  const queryClient = useQueryClient();
  const queues = useRef(new Map<string, QueueEntry>());
  const [pendingSkus, setPendingSkus] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState('');

  const markPending = useCallback((skuId: string, pending: boolean) => {
    setPendingSkus((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(skuId);
      } else {
        next.delete(skuId);
      }
      return next;
    });
  }, []);

  const enqueue = useCallback((skuId: string, action: CartAction) => {
    const key = cartKeys.cart(scope);
    const confirmed = queryClient.getQueryData<Cart>(key);
    setMessage('');
    queryClient.setQueryData<Cart>(key, (cart) => optimisticCart(cart, skuId, action));

    const existing = queues.current.get(skuId);
    if (existing) {
      existing.latest = action;
      return;
    }

    const entry: QueueEntry = {
      confirmed,
      latest: null,
    };
    queues.current.set(skuId, entry);
    markPending(skuId, true);

    const process = async () => {
      let currentAction: CartAction | null = action;
      while (currentAction) {
        try {
          const serverCart = currentAction.kind === 'remove'
            ? await cartApi.removeItem(skuId)
            : await cartApi.setItem(skuId, currentAction.quantity);
          if (priceChanged(entry.confirmed, serverCart)) {
            setMessage('המחיר עודכן לפי הסכום הנוכחי בחנות.');
          }
          entry.confirmed = serverCart;
          currentAction = entry.latest;
          entry.latest = null;
          queryClient.setQueryData(
            key,
            currentAction
              ? optimisticCart(serverCart, skuId, currentAction)
              : serverCart,
          );
        } catch (error) {
          entry.latest = null;
          queryClient.setQueryData(key, entry.confirmed);
          setMessage(cartMessage(error));
          await queryClient.invalidateQueries({ queryKey: key });
          currentAction = null;
        }
      }
      queues.current.delete(skuId);
      markPending(skuId, false);
    };

    void process();
  }, [markPending, queryClient, scope]);

  return {
    clearMessage: () => setMessage(''),
    isPending: (skuId: string) => pendingSkus.has(skuId),
    message,
    remove: (skuId: string) => enqueue(skuId, { kind: 'remove' }),
    setQuantity: (skuId: string, quantity: number) => enqueue(
      skuId,
      { kind: 'set', quantity },
    ),
  };
}

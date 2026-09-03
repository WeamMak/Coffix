import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { CartButton } from '../../src/components/CartButton';
import type { Cart } from '../../src/features/cart/api';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const cart: Cart = {
  currency: 'ILS',
  expires_at: '2099-09-03T11:00:00Z',
  id: 'cart-1',
  items: [],
  last_activity_at: '2026-09-03T10:00:00Z',
  status: 'active',
  subtotal_agorot: 0,
  total_quantity: 3,
  version: 1,
};

function response(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderCartButton(totalQuantity: number) {
  globalThis.fetch = jest.fn().mockResolvedValue(response({
    ...cart,
    total_quantity: totalQuantity,
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });

  await render(
    <QueryClientProvider client={client}>
      <CartButton sessionScope="session-1" />
    </QueryClientProvider>,
  );
}

describe('shared cart button', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the total number of cart units and opens the cart', async () => {
    await renderCartButton(3);

    const button = await screen.findByRole('button', {
      name: 'פתיחת הסל, 3 פריטים',
    });
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeOnTheScreen();

    await fireEvent.press(button);
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(shop)/cart');
  });

  it('does not render a count badge for an empty cart', async () => {
    await renderCartButton(0);

    expect(await screen.findByRole('button', { name: 'פתיחת הסל' })).toBeOnTheScreen();
    expect(screen.queryByText('0', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});

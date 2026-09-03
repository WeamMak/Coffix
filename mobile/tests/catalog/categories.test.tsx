import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { CategoriesContent } from '../../app/(tabs)/(shop)/categories';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

function jsonResponse(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function renderCategories() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CategoriesContent sessionScope="session-1" />
    </QueryClientProvider>,
  );
}

describe('categories route', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading, generic error, and a working retry', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    globalThis.fetch = jest.fn().mockImplementation(() => new Promise((_, reject) => {
      rejectRequest = reject;
    }));
    await renderCategories();
    expect(screen.getByText('טוענים קטגוריות')).toBeOnTheScreen();

    rejectRequest?.(new Error('private network detail'));
    expect(await screen.findByText('לא הצלחנו לטעון את הקטגוריות')).toBeOnTheScreen();

    jest.mocked(globalThis.fetch).mockResolvedValue(jsonResponse([]));
    await fireEvent.press(screen.getByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByText('אין קטגוריות להצגה')).toBeOnTheScreen();
  });

  it('renders two columns and navigates with the opaque category ID', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse([
      {
        icon_key: 'coffee-bean', id: 'category-opaque-1', image_url: null,
        is_active: true, name_he: 'פולי קפה', product_count: 38,
        slug: 'beans', sort_order: 1,
      },
      {
        icon_key: 'coffee', id: 'category-opaque-2', image_url: null,
        is_active: true, name_he: 'מכונות קפה', product_count: 24,
        slug: 'machines', sort_order: 2,
      },
    ]));
    await renderCategories();

    expect(await screen.findByText('פולי קפה')).toBeOnTheScreen();
    expect(screen.getByText('38 פריטים')).toBeOnTheScreen();
    expect(screen.getByTestId('category-grid')).toHaveStyle({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'פתיחת הסל' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(shop)/cart');
    await fireEvent.press(screen.getByRole('button', { name: 'פולי קפה, 38 פריטים' }));
    expect(router.push).toHaveBeenCalledWith({
      params: { categoryId: 'category-opaque-1' },
      pathname: '/(tabs)/(shop)/products/[categoryId]',
    });
  });
});

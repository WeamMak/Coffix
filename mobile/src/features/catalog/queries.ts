import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { catalogApi } from './api';
import type { ProductList, ProductListParams } from './types';

const PAGE_SIZE = 12;

export const catalogKeys = {
  activity: (scope: string) => ['private', scope, 'activity'] as const,
  cart: (scope: string) => ['private', scope, 'cart'] as const,
  categories: (scope: string) => [
    'private', scope, 'catalog', 'categories',
  ] as const,
  product: (scope: string, productId: string) => [
    'private', scope, 'catalog', 'product', productId,
  ] as const,
  products: (
    scope: string,
    params: Omit<ProductListParams, 'page'>,
  ) => [
    'private',
    scope,
    'catalog',
    'products',
    params.categoryId ?? null,
    params.featured ?? null,
    params.limit ?? PAGE_SIZE,
    params.query ?? null,
  ] as const,
};

export function useActivitySummary(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => catalogApi.getActivitySummary(),
    queryKey: catalogKeys.activity(scope),
  });
}

export function useCategories(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => catalogApi.getCategories(),
    queryKey: catalogKeys.categories(scope),
  });
}

export function useProducts(
  scope: string,
  params: Omit<ProductListParams, 'page'>,
) {
  return useInfiniteQuery<
    ProductList,
    Error,
    InfiniteData<ProductList>,
    ReturnType<typeof catalogKeys.products>,
    number
  >({
    enabled: Boolean(scope) && (params.query === undefined || params.query.length > 0),
    getNextPageParam: (lastPage) => (
      lastPage.page * lastPage.limit < lastPage.total
        ? lastPage.page + 1
        : undefined
    ),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => catalogApi.getProducts({
      ...params,
      limit: params.limit ?? PAGE_SIZE,
      page: pageParam,
    }),
    queryKey: catalogKeys.products(scope, params),
  });
}

export function useProduct(scope: string, productId: string) {
  return useQuery({
    enabled: Boolean(scope && productId),
    queryFn: () => catalogApi.getProduct(productId),
    queryKey: catalogKeys.product(scope, productId),
  });
}

export function useAddToCart(scope: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quantity, skuId }: { quantity: number; skuId: string }) => (
      catalogApi.addToCart(skuId, quantity)
    ),
    onSuccess: (cart) => {
      queryClient.setQueryData(catalogKeys.cart(scope), cart);
    },
  });
}

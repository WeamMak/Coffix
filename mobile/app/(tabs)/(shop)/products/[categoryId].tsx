import Feather from '@expo/vector-icons/Feather';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '../../../../src/components/Button';
import { CartButton } from '../../../../src/components/CartButton';
import { EmptyState } from '../../../../src/components/EmptyState';
import { ErrorState } from '../../../../src/components/ErrorState';
import { IconButton } from '../../../../src/components/IconButton';
import { ProductGrid } from '../../../../src/components/ProductGrid';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { useCategories, useProducts } from '../../../../src/features/catalog/queries';
import { goBack } from '../../../../src/navigation/goBack';
import { colors, spacing } from '../../../../src/theme';

type ProductListContentProps = {
  categoryId: string;
  sessionScope: string;
};

export function ProductListContent({ categoryId, sessionScope }: ProductListContentProps) {
  const categories = useCategories(sessionScope);
  const products = useProducts(sessionScope, { categoryId, limit: 12 });
  const items = products.data?.pages.flatMap((page) => page.items) ?? [];
  const total = products.data?.pages.at(-1)?.total ?? 0;
  const category = categories.data?.find(({ id }) => id === categoryId);
  const canLoadMore = products.hasNextPage && items.length < total;
  const header = (
    <View style={styles.headerRow}>
      <CartButton sessionScope={sessionScope} />
      <View style={styles.headerCopy}>
        <Text
          align="end"
          color={colors.accentDeep}
          style={styles.headerText}
          testID="category-eyebrow"
          variant="eyebrow"
        >
          חנות
        </Text>
        <Text
          align="end"
          style={styles.headerText}
          testID="category-title"
          variant="display"
        >
          {category?.name_he ?? 'מוצרים'}
        </Text>
      </View>
      <IconButton
        accessibilityLabel="חזרה"
        icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
        onPress={() => goBack('/(tabs)/(shop)' as Href)}
        style={styles.backButton}
      />
    </View>
  );

  return (
    <Screen contentContainerStyle={styles.screen} header={header} scroll>
      {products.isPending ? (
        <View accessibilityLiveRegion="polite" style={styles.centerState}>
          <ActivityIndicator color={colors.accentDeep} />
          <Text>טוענים מוצרים</Text>
        </View>
      ) : products.isError ? (
        <ErrorState
          message="לא הצלחנו לטעון את המוצרים"
          onRetry={() => void products.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="אין מוצרים להצגה" />
      ) : (
        <ProductGrid
          categories={categories.data ?? []}
          listFooter={canLoadMore ? (
            <Button
              accessibilityLabel="טעינת מוצרים נוספים"
              disabled={products.isFetchingNextPage}
              fullWidth
              onPress={() => void products.fetchNextPage()}
              style={styles.more}
              tone="soft"
            >
              {products.isFetchingNextPage ? 'טוענים מוצרים נוספים' : 'טעינת מוצרים נוספים'}
            </Button>
          ) : null}
          onProductPress={(productId) => router.push({
            params: { categoryId, productId, source: 'category' },
            pathname: '/(tabs)/(shop)/product/[productId]',
                } as unknown as Href)}
          products={items}
        />
      )}
    </Screen>
  );
}

export default function ProductListScreen() {
  const { categoryId: rawCategoryId } = useLocalSearchParams<{ categoryId: string | string[] }>();
  const { sessionScope } = useSession();
  const categoryId = Array.isArray(rawCategoryId) ? rawCategoryId[0] ?? '' : rawCategoryId ?? '';

  return <ProductListContent categoryId={categoryId} sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.md,
  },
  headerRow: {
    alignItems: 'center',
    direction: 'ltr',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: {
    borderRadius: 999,
    height: 44,
    width: 44,
  },
  headerCopy: {
    alignItems: 'stretch',
    direction: 'rtl',
    flex: 1,
    gap: spacing.xs,
  },
  headerText: {
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  centerState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
  more: {
    marginTop: spacing.xl,
  },
});

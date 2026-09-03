import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '../../../src/components/EmptyState';
import { CommerceHeader } from '../../../src/components/CommerceHeader';
import { ErrorState } from '../../../src/components/ErrorState';
import { ProductGrid } from '../../../src/components/ProductGrid';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { useCategories, useProducts } from '../../../src/features/catalog/queries';
import { useDebouncedSearch } from '../../../src/features/catalog/useDebouncedSearch';
import { categoryImage } from '../../../src/features/catalog/types';
import { colors, radii, spacing } from '../../../src/theme';

type CategoriesContentProps = {
  searchDelayMs?: number;
  sessionScope: string;
};

export function CategoriesContent({
  searchDelayMs = 300,
  sessionScope,
}: CategoriesContentProps) {
  const categories = useCategories(sessionScope);
  const [search, setSearch] = useState('');
  const query = useDebouncedSearch(search, searchDelayMs);
  const products = useProducts(sessionScope, { limit: 12, query });
  const productItems = products.data?.pages.flatMap((page) => page.items) ?? [];
  const productTotal = products.data?.pages.at(-1)?.total ?? 0;
  const canLoadMore = products.hasNextPage && productItems.length < productTotal;

  return (
    <Screen
      contentContainerStyle={styles.screen}
      header={(
        <CommerceHeader sessionScope={sessionScope}>
          <Text color={colors.accentDeep} variant="eyebrow">COFFIX</Text>
          <Text variant="display">חנות</Text>
        </CommerceHeader>
      )}
      scroll
    >
      <View style={styles.searchField}>
        <Feather color={colors.ink3} name="search" size={20} />
        <TextInput
          accessibilityLabel="חיפוש מוצרים"
          onChangeText={setSearch}
          placeholder="מה מחפשים היום?"
          placeholderTextColor={colors.ink3}
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
      </View>

      {query ? (
        products.isPending ? (
          <View accessibilityLiveRegion="polite" style={styles.centerState}>
            <ActivityIndicator color={colors.accentDeep} />
            <Text>מחפשים מוצרים</Text>
          </View>
        ) : products.isError ? (
          <ErrorState
            message="לא הצלחנו לחפש מוצרים"
            onRetry={() => void products.refetch()}
          />
        ) : productItems.length === 0 ? (
          <EmptyState title="לא נמצאו מוצרים" />
        ) : (
          <View style={styles.results}>
            <Text color={colors.ink2} variant="sectionTitle">תוצאות חיפוש</Text>
            <ProductGrid
              categories={categories.data ?? []}
              listFooter={canLoadMore ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={products.isFetchingNextPage}
                  onPress={() => void products.fetchNextPage()}
                  style={styles.moreResults}
                >
                  <Text variant="label">
                    {products.isFetchingNextPage ? 'טוענים מוצרים נוספים' : 'טעינת מוצרים נוספים'}
                  </Text>
                </Pressable>
              ) : null}
              onProductPress={(productId) => router.push({
                params: { productId, source: 'shop' },
                pathname: '/(tabs)/(shop)/product/[productId]',
              } as unknown as Href)}
              products={productItems}
            />
          </View>
        )
      ) : categories.isPending ? (
        <View accessibilityLiveRegion="polite" style={styles.centerState}>
          <ActivityIndicator color={colors.accentDeep} />
          <Text>טוענים קטגוריות</Text>
        </View>
      ) : categories.isError ? (
        <ErrorState
          message="לא הצלחנו לטעון את הקטגוריות"
          onRetry={() => void categories.refetch()}
        />
      ) : categories.data.length === 0 ? (
        <EmptyState title="אין קטגוריות להצגה" />
      ) : (
        <View style={styles.categorySection}>
          <Text color={colors.ink2} variant="sectionTitle">לעיין לפי קטגוריה</Text>
          <View style={styles.grid} testID="category-grid">
            {categories.data.map((category) => {
              const image = categoryImage(category);
              return (
            <Pressable
              accessibilityLabel={`${category.name_he}, ${category.product_count} פריטים`}
              accessibilityRole="button"
              key={category.id}
              onPress={() => router.push({
                params: { categoryId: category.id },
                pathname: '/(tabs)/(shop)/products/[categoryId]',
                } as unknown as Href)}
              style={({ pressed }) => [styles.card, pressed ? styles.pressed : undefined]}
            >
              {image ? (
                <Image
                  accessibilityLabel={image.alt}
                  accessible
                  resizeMode="cover"
                  source={{ uri: image.url }}
                  style={styles.image}
                />
              ) : (
                <View style={styles.fallback}>
                  <Feather color={colors.accentDeep} name="coffee" size={34} />
                </View>
              )}
              <View pointerEvents="none" style={styles.imageOverlay} />
              <Text style={styles.categoryName} variant="sectionTitle">
                {category.name_he}
              </Text>
              <Text color={colors.cream} style={styles.categoryCount} variant="caption">
                {category.product_count} פריטים
              </Text>
            </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </Screen>
  );
}

export default function CategoriesScreen() {
  const { sessionScope } = useSession();
  return <CategoriesContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.md,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.input,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    textAlign: 'right',
  },
  categorySection: {
    gap: spacing.lg,
  },
  centerState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
    width: '48%',
  },
  image: {
    aspectRatio: 1.2,
    backgroundColor: colors.chip,
    width: '100%',
  },
  fallback: {
    alignItems: 'center',
    aspectRatio: 1.2,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    width: '100%',
  },
  imageOverlay: {
    backgroundColor: 'rgba(43, 24, 16, 0.28)',
    bottom: 0,
    end: 0,
    position: 'absolute',
    start: 0,
    top: 0,
  },
  categoryName: {
    bottom: spacing['2xl'],
    color: colors.cream,
    end: spacing.lg,
    position: 'absolute',
  },
  categoryCount: {
    bottom: spacing.md,
    end: spacing.lg,
    position: 'absolute',
  },
  results: {
    gap: spacing.lg,
  },
  moreResults: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});

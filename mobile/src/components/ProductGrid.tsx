import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Category, Product } from '../features/catalog/types';
import { spacing } from '../theme';
import { ProductCard } from './ProductCard';

type ProductGridProps = {
  categories: Category[];
  listFooter?: ReactNode;
  onProductPress: (productId: string) => void;
  products: Product[];
};

export function ProductGrid({
  categories,
  listFooter,
  onProductPress,
  products,
}: ProductGridProps) {
  return (
    <>
      <View style={styles.grid} testID="product-grid">
        {products.map((product) => (
          <ProductCard
            category={categories.find(({ id }) => id === product.category_id)}
            key={product.id}
            onPress={onProductPress}
            product={product}
          />
        ))}
      </View>
      {listFooter}
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});

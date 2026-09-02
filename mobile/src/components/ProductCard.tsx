import Feather from '@expo/vector-icons/Feather';
import {
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import type { Category, Product } from '../features/catalog/types';
import { firstSellableSku, formatIls, productImage } from '../features/catalog/types';
import { colors, radii, spacing } from '../theme';
import { Pill } from './Pill';
import { Text } from './Text';

type ProductCardProps = {
  category?: Category;
  onPress: (productId: string) => void;
  product: Product;
  style?: StyleProp<ViewStyle>;
};

export function ProductCard({ category, onPress, product, style }: ProductCardProps) {
  const image = productImage(product, category);
  const sellableSku = firstSellableSku(product);
  const displaySku = product.skus.find((sku) => sku.is_active) ?? product.skus[0];
  const price = displaySku ? formatIls(displaySku.price_agorot) : 'מחיר לא זמין';
  const availability = !product.is_active
    ? 'לא זמין'
    : sellableSku
      ? 'זמין'
      : 'אזל מהמלאי';

  return (
    <Pressable
      accessibilityLabel={`${product.name_he}, ${price}, ${availability}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !product.is_active }}
      disabled={!product.is_active}
      onPress={() => onPress(product.id)}
      style={({ pressed }) => [
        styles.card,
        style,
        pressed && product.is_active ? styles.pressed : undefined,
        !product.is_active ? styles.disabled : undefined,
      ]}
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
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fallback}>
          <Feather color={colors.accentDeep} name="coffee" size={30} />
        </View>
      )}
      <View style={styles.copy}>
        {category ? (
          <Text color={colors.ink3} numberOfLines={1} variant="caption">
            {category.name_he}
          </Text>
        ) : null}
        <Text numberOfLines={2} variant="sectionTitle">{product.name_he}</Text>
        <Text color={colors.ink2} variant="label">{price}</Text>
        {!sellableSku ? <Pill tone="neutral">{availability}</Pill> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
    width: '48%',
  },
  image: {
    aspectRatio: 0.86,
    backgroundColor: colors.chip,
    width: '100%',
  },
  fallback: {
    alignItems: 'center',
    aspectRatio: 0.86,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    width: '100%',
  },
  copy: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
});

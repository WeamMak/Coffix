import Feather from '@expo/vector-icons/Feather';
import { StatusBar } from 'expo-status-bar';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../../src/components/Button';
import { ErrorState } from '../../../../src/components/ErrorState';
import { IconButton } from '../../../../src/components/IconButton';
import { QuantityStepper } from '../../../../src/components/QuantityStepper';
import { Screen } from '../../../../src/components/Screen';
import { Text } from '../../../../src/components/Text';
import { useSession } from '../../../../src/features/auth/useSession';
import { useAddToCart, useProduct } from '../../../../src/features/catalog/queries';
import {
  firstSellableSku,
  formatIls,
  maximumQuantity,
  productImage,
} from '../../../../src/features/catalog/types';
import { colors, radii, spacing } from '../../../../src/theme';

type ProductDetailContentProps = {
  categoryId?: string;
  productId: string;
  sessionScope: string;
  source?: 'category' | 'home' | 'shop';
};

const ATTRIBUTE_LABELS: Record<string, string> = {
  capacity: 'נפח',
  color: 'צבע',
  size: 'מידה',
  weight: 'משקל',
};

function stockLabel(stockQuantity: number | null | undefined): string {
  if (stockQuantity === null) {
    return 'מלאי זמין';
  }
  if (!stockQuantity) {
    return 'אזל מהמלאי';
  }
  return stockQuantity <= 5 ? `נותרו ${stockQuantity} במלאי` : 'במלאי';
}

export function ProductDetailContent({
  categoryId,
  productId,
  sessionScope,
  source,
}: ProductDetailContentProps) {
  const insets = useSafeAreaInsets();
  const productQuery = useProduct(sessionScope, productId);
  const addToCart = useAddToCart(sessionScope);
  const [quantity, setQuantity] = useState(1);
  const product = productQuery.data;
  const sku = product ? firstSellableSku(product) : null;
  const displaySku = sku ?? product?.skus.find((item) => item.is_active) ?? product?.skus[0];
  const maximum = sku ? maximumQuantity(sku) : 1;
  const image = product ? productImage(product) : null;

  const goBack = () => {
    if (source === 'category' && categoryId) {
      router.replace({
        params: { categoryId },
        pathname: '/(tabs)/(shop)/products/[categoryId]',
      } as unknown as Href);
      return;
    }
    router.replace(source === 'home' ? '/(tabs)/(home)' : '/(tabs)/(shop)' as Href);
  };

  useEffect(() => {
    setQuantity(1);
  }, [productId, sku?.id]);

  if (productQuery.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים מוצר</Text>
      </Screen>
    );
  }

  if (productQuery.isError || !product) {
    return (
      <Screen contentContainerStyle={styles.errorScreen}>
        <ErrorState
          message="לא הצלחנו לטעון את המוצר"
          onRetry={() => void productQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.root} safeAreaEdges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.hero}>
          {image ? (
            <Image
              accessibilityLabel={image.alt}
              accessible
              resizeMode="cover"
              source={{ uri: image.url }}
              style={styles.image}
            />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.fallback}
            >
              <Feather color={colors.accentDeep} name="coffee" size={58} />
            </View>
          )}
          <IconButton
            accessibilityLabel="חזרה"
            icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
            onPress={goBack}
            style={[styles.backButton, { top: insets.top + spacing.lg }]}
          />
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text color={colors.accent} variant="eyebrow">פרטי מוצר</Text>
              <Text variant="display">{product.name_he}</Text>
            </View>
            <Text variant="screenTitle">
              {displaySku ? formatIls(displaySku.price_agorot) : 'מחיר לא זמין'}
            </Text>
          </View>

          <Text color={colors.ink2}>{product.description_he}</Text>
          {displaySku ? (
            <View accessibilityLabel="מפרט מוצר" accessible style={styles.attributes}>
              {Object.entries(displaySku.attributes).map(([name, value], index, entries) => (
                <View
                  key={name}
                  style={[
                    styles.attributeRow,
                    index < entries.length - 1 ? styles.attributeDivider : undefined,
                  ]}
                >
                  <Text color={colors.ink3}>{ATTRIBUTE_LABELS[name] ?? name}</Text>
                  <Text variant="label">{String(value)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.stockRow}>
            <Text color={colors.ink3}>זמינות</Text>
            <Text color={sku ? colors.sage : colors.accentDeep} variant="label">
              {!product.is_active ? 'לא זמין' : stockLabel(displaySku?.stock_quantity)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View accessibilityLabel="אפשרויות רכישה" accessible={false} style={styles.purchase}>
        <View style={styles.purchaseRow}>
          <QuantityStepper
            disabled={!sku || addToCart.isPending}
            maximum={maximum}
            minimum={1}
            onChange={setQuantity}
            value={quantity}
          />
          <Button
            accessibilityLabel="הוספה לסל"
            disabled={!sku || addToCart.isPending}
            onPress={() => {
              if (sku) {
                addToCart.mutate(
                  { quantity, skuId: sku.id },
                );
              }
            }}
            style={styles.addButton}
          >
            {addToCart.isPending
              ? 'מוסיפים לסל'
              : `הוספה לסל${displaySku ? ` · ${formatIls(displaySku.price_agorot * quantity)}` : ''}`}
          </Button>
        </View>
        {addToCart.isError ? (
          <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
            לא הצלחנו להוסיף לסל. נסו שוב.
          </Text>
        ) : null}
        {addToCart.isSuccess ? (
          <Text accessibilityLiveRegion="polite" color={colors.sage}>נוסף לסל</Text>
        ) : null}
      </View>
    </Screen>
  );
}

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    productId: string | string[];
    source?: string | string[];
  }>();
  const { sessionScope } = useSession();
  const productId = Array.isArray(params.productId)
    ? params.productId[0] ?? ''
    : params.productId ?? '';
  const categoryId = Array.isArray(params.categoryId)
    ? params.categoryId[0]
    : params.categoryId;
  const rawSource = Array.isArray(params.source) ? params.source[0] : params.source;
  const source = rawSource === 'category' || rawSource === 'home' || rawSource === 'shop'
    ? rawSource
    : undefined;
  return (
    <ProductDetailContent
      categoryId={categoryId}
      productId={productId}
      sessionScope={sessionScope ?? ''}
      source={source}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'],
  },
  scroll: {
    flex: 1,
  },
  errorScreen: {
    gap: spacing['2xl'],
    justifyContent: 'center',
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.xl,
  },
  centerState: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: colors.ink,
    height: 380,
    position: 'relative',
  },
  backButton: {
    borderRadius: 999,
    height: 44,
    position: 'absolute',
    start: spacing.lg,
    width: 44,
    zIndex: 2,
  },
  image: {
    backgroundColor: colors.chip,
    height: '100%',
    width: '100%',
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopEndRadius: 28,
    borderTopStartRadius: 28,
    gap: spacing.lg,
    marginTop: -spacing['2xl'],
    padding: spacing.xl,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  titleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  attributes: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  attributeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  attributeDivider: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  stockRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  purchase: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  purchaseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  addButton: {
    flex: 1,
  },
});

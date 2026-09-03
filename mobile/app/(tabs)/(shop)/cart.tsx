import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { QuantityStepper } from '../../../src/components/QuantityStepper';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import type { CartItem } from '../../../src/features/cart/api';
import { formatRemaining, useCartExpiry } from '../../../src/features/cart/expiry';
import { useCartMutations } from '../../../src/features/cart/mutations';
import { isCartExpiredError, useCart } from '../../../src/features/cart/queries';
import { formatIls } from '../../../src/features/catalog/types';
import { colors, radii, spacing } from '../../../src/theme';

type CartContentProps = {
  sessionScope: string;
};

type CartItemRowProps = {
  item: CartItem;
  pending: boolean;
  onRemove: () => void;
  onSetQuantity: (quantity: number) => void;
};

function CartItemRow({
  item,
  onRemove,
  onSetQuantity,
  pending,
}: CartItemRowProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const maximum = item.stock_quantity === null
    ? 99
    : Math.max(item.quantity, Math.min(99, item.stock_quantity));
  return (
    <View style={styles.itemCard}>
      {item.image_url && !imageFailed ? (
        <Image
          accessibilityLabel={item.image_alt_he ?? item.name_he}
          accessible
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={{ uri: item.image_url }}
          style={styles.itemImage}
        />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.itemImage, styles.itemImageFallback]}
        >
          <Feather color={colors.accentDeep} name="coffee" size={30} />
        </View>
      )}
      <View style={styles.itemCopy}>
        <Text color={colors.ink3} variant="eyebrow">{item.sku_code}</Text>
        <Text variant="sectionTitle">{item.name_he}</Text>
        <View style={styles.itemFooter}>
          <QuantityStepper
            decreaseLabel={`הפחתת כמות ${item.name_he}`}
            disabled={pending}
            increaseLabel={`הגדלת כמות ${item.name_he}`}
            maximum={maximum}
            minimum={1}
            onChange={onSetQuantity}
            value={item.quantity}
          />
          <Text variant="sectionTitle">{formatIls(item.line_total_agorot)}</Text>
        </View>
      </View>
      <IconButton
        accessibilityLabel={`הסרת ${item.name_he} מהסל`}
        disabled={pending}
        icon={<Feather color={colors.ink3} name="x" size={17} />}
        onPress={onRemove}
        style={styles.removeButton}
      />
    </View>
  );
}

export function CartContent({ sessionScope }: CartContentProps) {
  const cartQuery = useCart(sessionScope);
  const mutations = useCartMutations(sessionScope);
  const cart = cartQuery.data;
  const seconds = useCartExpiry(cart?.expires_at ?? null, () => {
    void cartQuery.refetch();
  });

  if (cartQuery.isPending) {
    return (
      <Screen contentContainerStyle={styles.centerState}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים את הסל</Text>
      </Screen>
    );
  }

  if (cartQuery.isError) {
    if (isCartExpiredError(cartQuery.error)) {
      return (
        <Screen contentContainerStyle={styles.centerState}>
          <EmptyState
            actionLabel="טעינת סל עדכני"
            description="הפריטים נשמרים לזמן מוגבל כדי לשמור על מלאי הוגן."
            onAction={() => void cartQuery.refetch()}
            title="שמירת הסל הסתיימה"
          />
        </Screen>
      );
    }
    return (
      <Screen contentContainerStyle={styles.centerState}>
        <ErrorState
          message="לא הצלחנו לטעון את הסל"
          onRetry={() => void cartQuery.refetch()}
        />
      </Screen>
    );
  }

  const items = cart?.items ?? [];
  return (
    <Screen contentContainerStyle={styles.root} safeAreaEdges={['bottom', 'top']}>
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <IconButton
            accessibilityLabel="חזרה לחנות"
            icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
            onPress={() => router.replace('/(tabs)/(shop)' as Href)}
            style={styles.backButton}
          />
          <Text variant="screenTitle">הסל שלי</Text>
        </View>
        <Text color={colors.ink3}>{cart?.total_quantity ?? 0} פריטים</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.length === 0 ? (
          <EmptyState
            actionLabel="חזרה לחנות"
            onAction={() => router.replace('/(tabs)/(shop)' as Href)}
            title="הסל שלך ריק"
          />
        ) : (
          <>
            <View style={styles.items}>
              {items.map((item) => (
                <CartItemRow
                  item={item}
                  key={item.sku_id}
                  onRemove={() => mutations.remove(item.sku_id)}
                  onSetQuantity={(quantity) => mutations.setQuantity(item.sku_id, quantity)}
                  pending={mutations.isPending(item.sku_id)}
                />
              ))}
            </View>

            <View style={styles.reservationCard}>
              <Feather color={colors.accentDeep} name="clock" size={20} />
              <View style={styles.reservationCopy}>
                <Text variant="label">הפריטים שמורים עבורכם לזמן מוגבל</Text>
                <Text color={colors.ink2} variant="caption">
                  השרת יאשר את המלאי והמחיר בכל עדכון.
                </Text>
              </View>
              <Text accessibilityLabel={`נותרו ${formatRemaining(seconds)}`} variant="label">
                {formatRemaining(seconds)}
              </Text>
            </View>

            {mutations.message ? (
              <Text accessibilityLiveRegion="polite" color={colors.accentDeep}>
                {mutations.message}
              </Text>
            ) : null}

            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text color={colors.ink2}>סכום מוצרים</Text>
                <Text variant="label">{formatIls(cart?.subtotal_agorot ?? 0)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text variant="sectionTitle">לתשלום לפני משלוח</Text>
                <Text variant="screenTitle">{formatIls(cart?.subtotal_agorot ?? 0)}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {items.length > 0 ? (
        <View style={styles.checkoutBar}>
          <Button
            accessibilityLabel="המשך לתשלום"
            fullWidth
            onPress={() => router.push('/(tabs)/(shop)/checkout' as Href)}
          >
            המשך לתשלום
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}

export default function CartScreen() {
  const { sessionScope } = useSession();
  return <CartContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  root: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  centerState: {
    gap: spacing.lg,
    justifyContent: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    borderRadius: radii.pill,
  },
  scrollContent: {
    gap: spacing.xl,
    paddingBottom: 132,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  items: {
    gap: spacing.md,
  },
  itemCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  itemImage: {
    borderRadius: radii.input,
    height: 82,
    width: 82,
  },
  itemImageFallback: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  itemFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  removeButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  reservationCard: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.input,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  reservationCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  summaryRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  checkoutBar: {
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    bottom: 0,
    end: 0,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    position: 'absolute',
    start: 0,
  },
});

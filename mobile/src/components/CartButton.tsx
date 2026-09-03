import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useCartExpiry } from '../features/cart/expiry';
import { isCartExpiredError, useCart } from '../features/cart/queries';
import { colors, radii } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type CartButtonProps = {
  sessionScope: string;
};

export function CartButton({ sessionScope }: CartButtonProps) {
  const cart = useCart(sessionScope);
  useCartExpiry(cart.data?.expires_at ?? null, () => {
    void cart.refetch();
  });
  const quantity = isCartExpiredError(cart.error)
    ? 0
    : cart.data?.total_quantity ?? 0;
  const accessibilityLabel = quantity > 0
    ? `פתיחת הסל, ${quantity} פריטים`
    : 'פתיחת הסל';

  return (
    <View style={styles.container}>
      <IconButton
        accessibilityLabel={accessibilityLabel}
        icon={<Feather color={colors.accentDeep} name="shopping-cart" size={20} />}
        onPress={() => router.push('/(tabs)/(shop)/cart' as Href)}
        style={styles.button}
      />
      {quantity > 0 ? (
        <View accessibilityElementsHidden style={styles.badge}>
          <Text align="center" color={colors.cream} style={styles.badgeText} variant="caption">
            {quantity}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  button: {
    borderRadius: radii.pill,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.cream,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    start: -5,
    top: -5,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 13,
  },
});

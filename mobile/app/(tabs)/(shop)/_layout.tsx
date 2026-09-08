import { Stack } from 'expo-router/js-stack';

import { useStackTransitions } from '../../../src/navigation/stackTransitions';
import { colors } from '../../../src/theme';

export default function ShopStackLayout() {
  const stackTransitions = useStackTransitions();
  return (
    <Stack
      screenOptions={{
        ...stackTransitions,
        cardStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="products/[categoryId]" />
      <Stack.Screen name="product/[productId]" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="confirmation" />
    </Stack>
  );
}

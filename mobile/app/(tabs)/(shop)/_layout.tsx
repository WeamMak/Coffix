import { Stack } from 'expo-router';

import { colors } from '../../../src/theme';

export default function ShopStackLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_left',
        contentStyle: { backgroundColor: colors.cream },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="products/[categoryId]" />
      <Stack.Screen name="product/[productId]" />
    </Stack>
  );
}

import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { OrderCard } from '../../../src/components/OrderCard';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import { useOrders } from '../../../src/features/orders/queries';
import {
  ORDER_FILTERS,
  filterOrders,
  ordersEmptyMessage,
  type OrderFilter,
} from '../../../src/features/orders/status';
import { colors, radii, spacing } from '../../../src/theme';

type OrdersListContentProps = {
  sessionScope: string;
};

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export function OrdersListContent({ sessionScope }: OrdersListContentProps) {
  const [filter, setFilter] = useState<OrderFilter>('all');
  const orders = useOrders(sessionScope);

  const { refetch } = orders;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const header = (
    <View style={styles.header}>
      <Text variant="screenTitle">ההזמנות שלי</Text>
      <ScrollView
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {ORDER_FILTERS.map((option) => {
          const selected = option.key === filter;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.key}
              onPress={() => setFilter(option.key)}
              style={[styles.chip, selected ? styles.chipActive : undefined]}
            >
              <Text color={selected ? colors.cream : colors.ink2} variant="caption">
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (orders.isPending) {
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים הזמנות</Text>
      </Screen>
    );
  }

  if (orders.isError) {
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        <ErrorState
          message="לא הצלחנו לטעון את ההזמנות"
          onRetry={() => void orders.refetch()}
        />
      </Screen>
    );
  }

  const visible = filterOrders(orders.data, filter);

  return (
    <Screen contentContainerStyle={styles.body} header={header}>
      <FlatList
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={<EmptyState title={ordersEmptyMessage(filter)} />}
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(order) => order.id}
        onRefresh={() => void orders.refetch()}
        refreshing={orders.isRefetching}
        renderItem={({ item }) => (
          <OrderCard
            onPress={(orderId) => router.push(`/(tabs)/(orders)/${orderId}` as Href)}
            order={item}
          />
        )}
        style={styles.list}
        testID="orders-list"
      />
    </Screen>
  );
}

export default function OrdersListScreen() {
  const { sessionScope } = useSession();
  return <OrdersListContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  filters: {
    gap: spacing.sm,
    paddingEnd: spacing.xl,
  },
  chip: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  body: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  center: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
});

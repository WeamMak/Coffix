import { ApiClientError } from '@coffix/api-client';
import Feather from '@expo/vector-icons/Feather';
import { type Href, useLocalSearchParams } from 'expo-router';
import { type ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { IconButton } from '../../../src/components/IconButton';
import { Screen } from '../../../src/components/Screen';
import { StatusTimeline } from '../../../src/components/StatusTimeline';
import { Text } from '../../../src/components/Text';
import { TrackingCard } from '../../../src/components/TrackingCard';
import { useSession } from '../../../src/features/auth/useSession';
import { formatIls } from '../../../src/features/catalog/types';
import type { Order } from '../../../src/features/orders/api';
import { useOrder, useRefetchOnFocus } from '../../../src/features/orders/queries';
import { buildTimeline } from '../../../src/features/orders/status';
import { goBack } from '../../../src/navigation/goBack';
import { colors, radii, spacing } from '../../../src/theme';

type OrderDetailContentProps = {
  orderId: string;
  sessionScope: string;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function OrderItemsCard({ items }: { items: Order['items'] }) {
  return (
    <View style={styles.card}>
      <Text color={colors.ink2} variant="label">פריטים</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <View style={styles.itemCopy}>
            <Text variant="sectionTitle">{item.product_name_he}</Text>
            <View style={styles.itemMeta}>
              <Text color={colors.ink3} variant="caption">{item.sku_code}</Text>
              <Text color={colors.ink3} variant="caption">{`כמות: ${item.quantity}`}</Text>
            </View>
          </View>
          <Text variant="label">{formatIls(item.line_total_agorot)}</Text>
        </View>
      ))}
    </View>
  );
}

function OrderSummaryCard({ order }: { order: Order }) {
  const shipping = order.shipping_agorot === 0
    ? 'חינם'
    : formatIls(order.shipping_agorot);

  return (
    <View style={styles.card}>
      <View style={styles.summaryRow}>
        <Text color={colors.ink2}>סכום ביניים</Text>
        <Text variant="label">{formatIls(order.subtotal_agorot)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text color={colors.ink2}>משלוח</Text>
        <Text variant="label">{shipping}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text variant="sectionTitle">לתשלום</Text>
        <Text variant="screenTitle">{formatIls(order.total_agorot)}</Text>
      </View>
    </View>
  );
}

function OrderAddressCard({ address }: { address: Order['address'] }) {
  const street = [address.street, address.building].filter(Boolean).join(' ');
  const cityLine = [
    address.apartment ? `דירה ${address.apartment}` : null,
    address.city,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <Text color={colors.ink2} variant="label">כתובת למשלוח</Text>
      <Text variant="sectionTitle">{address.recipient_name}</Text>
      <Text color={colors.ink2}>{street}</Text>
      <Text color={colors.ink2}>{cityLine}</Text>
    </View>
  );
}

export function OrderDetailContent({ orderId, sessionScope }: OrderDetailContentProps) {
  const query = useOrder(sessionScope, orderId);
  const order = query.data;
  useRefetchOnFocus(query.refetch);

  const header = (
    <View style={styles.header}>
      <IconButton
        accessibilityLabel="חזרה להזמנות"
        icon={<Feather color={colors.ink} name="chevron-right" size={20} />}
        onPress={() => goBack('/(tabs)/(orders)' as Href)}
        style={styles.backButton}
      />
      <View style={styles.headerCopy}>
        <Text color={colors.ink3} variant="eyebrow">הזמנה</Text>
        <Text variant="screenTitle">{order?.order_number ?? 'פרטי הזמנה'}</Text>
      </View>
    </View>
  );

  if (query.isPending) {
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        <ActivityIndicator color={colors.accentDeep} />
        <Text>טוענים את ההזמנה</Text>
      </Screen>
    );
  }

  if (query.isError || !order) {
    const notFound = query.error instanceof ApiClientError
      && query.error.problem.status === 404;
    return (
      <Screen contentContainerStyle={styles.center} header={header}>
        {notFound ? (
          <EmptyState
            actionLabel="חזרה להזמנות"
            description="ייתכן שההזמנה נמחקה או שאינה שייכת לחשבון זה."
            onAction={() => goBack('/(tabs)/(orders)' as Href)}
            title="לא מצאנו את ההזמנה"
          />
        ) : (
          <ErrorState
            message="לא הצלחנו לטעון את ההזמנה"
            onRetry={() => void query.refetch()}
          />
        )}
      </Screen>
    );
  }

  const sections: { key: string; render: () => ReactElement }[] = [
    { key: 'tracking', render: () => <TrackingCard order={order} /> },
    {
      key: 'timeline',
      render: () => (
        <View style={styles.section} testID="order-timeline">
          <Text color={colors.ink2} variant="label">מעקב</Text>
          <StatusTimeline entries={buildTimeline(order.history)} />
        </View>
      ),
    },
    { key: 'items', render: () => <OrderItemsCard items={order.items} /> },
    { key: 'summary', render: () => <OrderSummaryCard order={order} /> },
    { key: 'address', render: () => <OrderAddressCard address={order.address} /> },
  ];

  return (
    <Screen contentContainerStyle={styles.body} header={header}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={sections}
        keyExtractor={(section) => section.key}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        renderItem={({ item }) => item.render()}
        style={styles.list}
        testID="order-detail-list"
      />
    </Screen>
  );
}

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const { sessionScope } = useSession();
  return (
    <OrderDetailContent
      orderId={firstParam(params.orderId)}
      sessionScope={sessionScope ?? ''}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backButton: {
    borderRadius: radii.pill,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  body: {
    paddingEnd: 0,
    paddingStart: 0,
  },
  center: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalRow: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
});

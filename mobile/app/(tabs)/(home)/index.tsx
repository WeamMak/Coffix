import Feather from '@expo/vector-icons/Feather';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { CommerceHeader } from '../../../src/components/CommerceHeader';
import { EmptyState } from '../../../src/components/EmptyState';
import { ErrorState } from '../../../src/components/ErrorState';
import { ProductCard } from '../../../src/components/ProductCard';
import { Screen } from '../../../src/components/Screen';
import { Text } from '../../../src/components/Text';
import { useSession } from '../../../src/features/auth/useSession';
import {
  useActivitySummary,
  useCategories,
  useProducts,
} from '../../../src/features/catalog/queries';
import { colors, radii, spacing } from '../../../src/theme';

type HomeContentProps = {
  sessionScope: string;
};

const ACTIVITY_STATE_LABELS: Record<string, string> = {
  awaiting_additional_decision: 'ממתין לאישור',
  awaiting_additional_payment: 'ממתין לתשלום',
  awaiting_admin_review: 'בבדיקה',
  awaiting_diagnostic_payment: 'ממתין לתשלום',
  diagnosing: 'באבחון',
  paid: 'שולם',
  pending_payment: 'ממתין לתשלום',
  processing: 'בהכנה',
  ready_for_return: 'מוכן להחזרה',
  received: 'התקבל',
  repair_in_progress: 'בתיקון',
  scheduled: 'נקבע מועד',
  shipped: 'נשלח',
};

const CATEGORY_ICONS: Record<string, ComponentProps<typeof Feather>['name']> = {
  capsule: 'package',
  coffee: 'coffee',
  'coffee-bean': 'disc',
  settings: 'settings',
  sparkles: 'star',
  wrench: 'tool',
};

function activityStateLabel(state: string): string {
  return ACTIVITY_STATE_LABELS[state] ?? 'בטיפול';
}

export function HomeContent({ sessionScope }: HomeContentProps) {
  const activity = useActivitySummary(sessionScope);
  const categories = useCategories(sessionScope);
  const featured = useProducts(sessionScope, { featured: true, limit: 6 });
  const featuredProducts = featured.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen
      contentContainerStyle={styles.screen}
      header={(
        <CommerceHeader sessionScope={sessionScope}>
          <Text color={colors.accentDeep} variant="eyebrow">COFFIX</Text>
          <Text variant="display">
            {activity.data?.display_name ? `שלום, ${activity.data.display_name}` : 'שלום'}
          </Text>
          <Text color={colors.ink2}>קפה טוב, בדיוק בדרך שלך.</Text>
        </CommerceHeader>
      )}
      scroll
    >
      {activity.isPending ? (
        <View accessibilityLiveRegion="polite" style={styles.loadingRow}>
          <ActivityIndicator color={colors.accentDeep} />
          <Text>טוענים פעילות</Text>
        </View>
      ) : activity.isError ? (
        <ErrorState
          message="לא הצלחנו לטעון את הפעילות"
          onRetry={() => void activity.refetch()}
        />
      ) : activity.data?.active_order || activity.data?.active_service_request ? (
        <View style={styles.activityGrid}>
          {activity.data.active_order ? (
            <Pressable
              accessibilityLabel={`הזמנה פעילה ${activity.data.active_order.order_number}`}
              accessibilityRole="button"
              onPress={() => router.push(
                `/(tabs)/(orders)/${activity.data?.active_order?.id}` as Href,
              )}
              style={({ pressed }) => [styles.activityPressable, pressed ? styles.pressed : undefined]}
            >
              <Card style={styles.activityCard}>
                <Feather color={colors.accentDeep} name="package" size={22} />
                <Text variant="sectionTitle">הזמנה פעילה</Text>
                <Text color={colors.ink2}>{activity.data.active_order.order_number}</Text>
                <Text color={colors.sage} variant="caption">
                  {activityStateLabel(activity.data.active_order.state)}
                </Text>
              </Card>
            </Pressable>
          ) : null}
          {activity.data.active_service_request ? (
            <Pressable
              accessibilityLabel={`שירות ${activity.data.active_service_request.reference}`}
              accessibilityRole="button"
              onPress={() => router.push(
                `/(tabs)/(service)/${activity.data?.active_service_request?.id}` as Href,
              )}
              style={({ pressed }) => [styles.activityPressable, pressed ? styles.pressed : undefined]}
            >
              <Card style={styles.activityCard}>
                <Feather color={colors.accentDeep} name="tool" size={22} />
                <Text variant="sectionTitle">שירות</Text>
                <Text color={colors.ink2}>{activity.data.active_service_request.reference}</Text>
                <Text color={colors.sage} variant="caption">
                  {activityStateLabel(activity.data.active_service_request.state)}
                </Text>
              </Card>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text color={colors.accent} variant="eyebrow">קטגוריות</Text>
          <Text variant="screenTitle">לחפש מה?</Text>
        </View>
        {categories.isPending ? (
          <Text>טוענים קטגוריות</Text>
        ) : categories.isError ? (
          <ErrorState
            message="לא הצלחנו לטעון את הקטגוריות"
            onRetry={() => void categories.refetch()}
          />
        ) : categories.data.length === 0 ? (
          <EmptyState title="אין קטגוריות להצגה" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.horizontalContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {categories.data.map((category) => (
              <Pressable
                accessibilityLabel={`${category.name_he}, ${category.product_count} פריטים`}
                accessibilityRole="button"
                key={category.id}
                onPress={() => router.push({
                  params: { categoryId: category.id },
                  pathname: '/(tabs)/(shop)/products/[categoryId]',
                } as unknown as Href)}
                style={({ pressed }) => [styles.categoryCard, pressed ? styles.pressed : undefined]}
              >
                <View style={styles.categoryIcon}>
                  <Feather
                    color={colors.accentDeep}
                    name={CATEGORY_ICONS[category.icon_key ?? ''] ?? 'grid'}
                    size={20}
                  />
                </View>
                <View style={styles.categoryCopy}>
                  <Text variant="sectionTitle">{category.name_he}</Text>
                  <Text color={colors.ink3} variant="caption">
                    {category.product_count} פריטים
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text color={colors.accent} variant="eyebrow">החודש</Text>
          <Text variant="screenTitle">מוצרים מובילים</Text>
        </View>
        {featured.isPending ? (
          <Text>טוענים מוצרים מובילים</Text>
        ) : featured.isError ? (
          <ErrorState
            message="לא הצלחנו לטעון את המוצרים המובילים"
            onRetry={() => void featured.refetch()}
          />
        ) : featuredProducts.length === 0 ? (
          <EmptyState title="אין מוצרים מובילים כרגע" />
        ) : (
          <ScrollView
            contentContainerStyle={styles.horizontalContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {featuredProducts.map((product) => (
              <ProductCard
                category={categories.data?.find(({ id }) => id === product.category_id)}
                key={product.id}
                onPress={(productId) => router.push({
                  params: { productId, source: 'home' },
                  pathname: '/(tabs)/(shop)/product/[productId]',
                } as unknown as Href)}
                product={product}
                style={styles.featuredCard}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <Card style={styles.serviceCta}>
        <View accessibilityElementsHidden style={styles.serviceDecoration} />
        <View style={styles.serviceCopy}>
          <Text color={colors.accent} variant="eyebrow">שירות טכני</Text>
          <Text color={colors.cream} variant="screenTitle">המכונה שלך עייפה?</Text>
          <Text color={colors.cream} variant="screenTitle">נבוא לאסוף היום.</Text>
          <Text color={colors.ink3}>איסוף, אבחון, החזרה. בקשת שירות ב־3 דקות.</Text>
        </View>
        <Button
          accessibilityLabel="בקשת שירות"
          onPress={() => router.push('/(tabs)/(service)' as Href)}
          size="medium"
          tone="accent"
        >
          בקשת שירות
        </Button>
      </Card>
    </Screen>
  );
}

export default function AuthenticatedHomeScreen() {
  const { sessionScope } = useSession();
  return <HomeContent sessionScope={sessionScope ?? ''} />;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.md,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  activityGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  activityPressable: {
    flex: 1,
  },
  activityCard: {
    gap: spacing.sm,
    minHeight: 146,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeading: {
    gap: spacing.xs,
  },
  horizontalContent: {
    gap: spacing.md,
    paddingEnd: spacing.xl,
  },
  categoryCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    height: 82,
    paddingHorizontal: spacing.lg,
    width: 190,
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  categoryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  featuredCard: {
    width: 176,
  },
  serviceCta: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    gap: spacing.xl,
    overflow: 'hidden',
    padding: spacing['2xl'],
    position: 'relative',
  },
  serviceCopy: {
    gap: spacing.sm,
    zIndex: 1,
  },
  serviceDecoration: {
    backgroundColor: '#4B281A',
    borderRadius: 100,
    height: 180,
    position: 'absolute',
    end: -50,
    top: -50,
    width: 180,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});

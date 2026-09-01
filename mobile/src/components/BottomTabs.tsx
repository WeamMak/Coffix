import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { he } from '../i18n/he';
import { colors, fontFamilies, spacing } from '../theme';
import { Text } from './Text';

export type TabKey = 'home' | 'shop' | 'service' | 'orders' | 'profile';
export type TabRoute = '(home)' | '(shop)' | '(service)' | '(orders)' | '(profile)';

export type TabItem = {
  icon: ComponentProps<typeof Feather>['name'];
  key: TabKey;
  label: string;
  route: TabRoute;
};

export const TAB_ITEMS = [
  { key: 'home', route: '(home)', label: he.tabs.home, icon: 'home' },
  { key: 'shop', route: '(shop)', label: he.tabs.shop, icon: 'shopping-bag' },
  { key: 'service', route: '(service)', label: he.tabs.service, icon: 'tool' },
  { key: 'orders', route: '(orders)', label: he.tabs.orders, icon: 'package' },
  { key: 'profile', route: '(profile)', label: he.tabs.profile, icon: 'user' },
] as const satisfies readonly TabItem[];

export type BottomTabsProps = {
  activeKey: TabKey;
  bottomInset?: number;
  onSelect: (key: TabKey) => void;
};

export function BottomTabs({ activeKey, bottomInset = 0, onSelect }: BottomTabsProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}
    >
      {TAB_ITEMS.map((tab) => {
        const selected = tab.key === activeKey;

        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={({ pressed }) => [styles.tab, pressed ? styles.pressed : undefined]}
          >
            <View style={styles.iconContainer}>
              {selected ? <View style={styles.activeDot} /> : null}
              <Feather
                color={selected ? colors.ink : colors.ink3}
                name={tab.icon}
                size={22}
              />
            </View>
            <Text
              align="center"
              color={selected ? colors.ink : colors.ink3}
              style={selected ? styles.activeLabel : undefined}
              variant="eyebrow"
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cream,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'flex-start',
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.9,
  },
  iconContainer: {
    position: 'relative',
  },
  activeDot: {
    backgroundColor: colors.accent,
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    right: 9,
    top: -7,
    width: 4,
  },
  activeLabel: {
    fontFamily: fontFamilies.sans.semiBold,
  },
});

import { Tabs } from 'expo-router';

import {
  BottomTabs,
  TAB_ITEMS,
  type TabKey,
} from '../../src/components/BottomTabs';
import { colors } from '../../src/theme';

type TabBarAdapterProps = {
  insets: {
    bottom: number;
  };
  navigation: {
    navigate: (name: string) => void;
  };
  state: {
    index: number;
    routes: { name: string }[];
  };
};

function TabBarAdapter({ insets, navigation, state }: TabBarAdapterProps) {
  const activeRoute = state.routes[state.index]?.name;
  const activeKey = TAB_ITEMS.find(({ route }) => route === activeRoute)?.key ?? 'home';

  const selectTab = (key: TabKey) => {
    const tab = TAB_ITEMS.find((item) => item.key === key);
    if (tab) {
      navigation.navigate(tab.route);
    }
  };

  return (
    <BottomTabs
      activeKey={activeKey}
      bottomInset={insets.bottom}
      onSelect={selectTab}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        animation: 'none',
        headerShown: false,
        sceneStyle: { backgroundColor: colors.cream },
      }}
      tabBar={(props) => <TabBarAdapter {...props} />}
    >
      {TAB_ITEMS.map((tab) => (
        <Tabs.Screen
          key={tab.key}
          name={tab.route}
          options={{ title: tab.label }}
        />
      ))}
    </Tabs>
  );
}

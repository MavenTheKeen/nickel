import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';

import { registerQuickActions } from '@/platform/quickActions';
import { useTheme } from '@/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, color, size }: { name: IconName; color: ColorValue; size: number }) {
  // The tab bar always passes the tint colours set below, which are strings.
  return <MaterialCommunityIcons name={name} color={color as string} size={size} />;
}

const icon = (name: IconName) =>
  function Icon({ color, size }: { color: ColorValue; size: number }) {
    return <TabIcon name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
  const theme = useTheme();
  // Registered here rather than in the root layout, because handling an action
  // navigates and the navigator must already be mounted.
  useEffect(() => registerQuickActions((href) => router.push(href)), []);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.rule },
        headerShadowVisible: false,
        // A short cross-fade with a slight shift when switching tabs.
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transactions', tabBarIcon: icon('format-list-bulleted') }}
      />
      <Tabs.Screen name="budgets" options={{ title: 'Budgets', tabBarIcon: icon('chart-donut') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: icon('chart-bar') }} />
      <Tabs.Screen name="bills" options={{ title: 'Bills', tabBarIcon: icon('calendar-sync') }} />
    </Tabs>
  );
}

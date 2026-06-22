import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBottomSafeInset } from '@/hooks/useBottomSafeInset';
import { isWeb } from '@/lib/platform';

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const isLoggedIn = Boolean(user);
  const tabBarBottom = useBottomSafeInset(isWeb ? 24 : 8);
  const tabBarHeight = 48 + tabBarBottom;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: isLoggedIn
          ? {
              backgroundColor: colors.surface,
              borderTopColor: colors.surfaceBorder,
              height: tabBarHeight,
              paddingBottom: tabBarBottom,
              paddingTop: 6,
            }
          : { display: 'none' },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: isLoggedIn,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Boards',
          tabBarLabel: 'Home',
          href: isLoggedIn ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="save"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isLoggedIn ? 'Account' : 'Sign in',
          tabBarLabel: 'Account',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

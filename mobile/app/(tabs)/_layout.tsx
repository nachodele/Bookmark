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
  const tabBarBottom = useBottomSafeInset(isWeb ? 16 : 8);
  /** Icon + label zone — safe-area padding sits below this, not inside it */
  const tabBarCoreHeight = isWeb ? 58 : 56;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.accent,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarShowLabel: true,
        tabBarStyle: isLoggedIn
          ? {
              backgroundColor: colors.surface,
              borderTopColor: colors.surfaceBorder,
              height: tabBarCoreHeight + tabBarBottom,
              paddingBottom: tabBarBottom,
              paddingTop: 6,
            }
          : { display: 'none' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
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
            <Ionicons
              name={isWeb ? 'home-outline' : focused ? 'home' : 'home-outline'}
              size={focused && isWeb ? size + 1 : size}
              color={color}
            />
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
            <Ionicons
              name={isWeb ? 'person-circle-outline' : focused ? 'person-circle' : 'person-circle-outline'}
              size={focused && isWeb ? size + 1 : size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

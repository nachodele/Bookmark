import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const isLoggedIn = Boolean(user);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: isLoggedIn
          ? {
              backgroundColor: colors.surface,
              borderTopColor: colors.surfaceBorder,
              height: 60,
              paddingBottom: 8,
              paddingTop: 8,
            }
          : { display: 'none' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

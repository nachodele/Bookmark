import { Stack, useRouter, useSegments } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { ShareToastBanner } from '@/components/ShareToastBanner';
import { useShareHandler } from '@/hooks/useShareHandler';

function RootNavigator() {
  const { user, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const { toast } = useShareHandler();

  useEffect(() => {
    if (loading) return;

    const onAccount = (segments as string[]).includes('account');

    if (!user && !onAccount) {
      router.replace('/account');
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="board/[id]"
          options={{
            title: 'Board',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
      <ShareToastBanner toast={toast} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <ThemeProvider>
        <NetworkProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}

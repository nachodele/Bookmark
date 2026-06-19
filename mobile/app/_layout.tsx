import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { WebShareCapture } from '@/components/WebShareCapture';
import { ShareToastBanner } from '@/components/ShareToastBanner';
import { ShareIntentRoot } from '@/components/ShareIntentRoot';
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
      <PwaBootstrap />
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentRoot>
      <ThemeProvider>
        <NetworkProvider>
          <AuthProvider>
            <WebShareCapture />
            <RootNavigator />
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ShareIntentRoot>
  );
}

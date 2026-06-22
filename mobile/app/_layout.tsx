import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { isPasswordSetupRequired } from '@/lib/auth/password-setup';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { WebShareCapture } from '@/components/WebShareCapture';
import { ShareIntentRoot } from '@/components/ShareIntentRoot';
import { ShareReviewProvider, ShareReviewPendingConsumer } from '@/contexts/ShareReviewContext';
import { ShareIntentConsumer } from '@/components/ShareIntentConsumer';

function RootNavigator() {
  const { user, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const segmentList = segments as string[];
    const onAccount = segmentList.includes('account');
    const onAuthCallback =
      segmentList[0] === 'auth' && segmentList[1] === 'callback';
    const onSetPassword = segmentList[0] === 'set-password';

    if (!user) {
      if (!onAccount && !onAuthCallback) {
        router.replace('/account');
      }
      return;
    }

    const enforcePasswordSetup = async () => {
      const required = await isPasswordSetupRequired();
      if (required && !onSetPassword && !onAuthCallback) {
        router.replace('/set-password');
      }
    };

    void enforcePasswordSetup();
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
        <Stack.Screen
          name="set-password"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
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
            <ShareReviewProvider>
              <ShareReviewPendingConsumer />
              <ShareIntentConsumer />
              <RootNavigator />
            </ShareReviewProvider>
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ShareIntentRoot>
  );
}

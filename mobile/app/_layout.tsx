import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { WebAuthCallback } from '@/components/WebAuthCallback';
import { WebShareCapture } from '@/components/WebShareCapture';
import { ShareToastBanner } from '@/components/ShareToastBanner';
import { ShareReviewModal } from '@/components/ShareReviewModal';
import { ShareIntentRoot } from '@/components/ShareIntentRoot';
import { useShareHandler } from '@/hooks/useShareHandler';

function RootNavigator() {
  const { user, loading, session } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const {
    toast,
    reviewVisible,
    reviewLoading,
    reviewDraft,
    dismissReview,
    handleReviewSaved,
  } = useShareHandler();

  useEffect(() => {
    if (loading) return;

    const segmentList = segments as string[];
    const onAccount = segmentList.includes('account');
    const onAuthCallback =
      segmentList[0] === 'auth' && segmentList[1] === 'callback';

    if (!user) {
      if (!onAccount && !onAuthCallback) {
        router.replace('/account');
      }
      return;
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
        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
      <ShareToastBanner toast={toast} />
      <ShareReviewModal
        visible={reviewVisible}
        loading={reviewLoading}
        draft={reviewDraft}
        accessToken={session?.access_token ?? null}
        onClose={dismissReview}
        onSaved={handleReviewSaved}
      />
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
            <WebAuthCallback />
            <WebShareCapture />
            <RootNavigator />
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ShareIntentRoot>
  );
}

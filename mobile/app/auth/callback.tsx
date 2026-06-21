import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { resolveOAuthCallback } from '@/lib/auth/oauth-session';
import { isWeb } from '@/lib/platform';
import { useTheme } from '@/contexts/ThemeContext';

type CallbackState = 'loading' | 'error';

export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const [state, setState] = useState<CallbackState>('loading');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async (href: string | null) => {
      let result = await resolveOAuthCallback(href);
      if (!result.ok) {
        result = await resolveOAuthCallback(href);
      }
      if (cancelled) return;
      if (result.ok) return;
      setDetail(result.error);
      setState('error');
    };

    if (isWeb && typeof window !== 'undefined') {
      void run(window.location.href);
      return () => {
        cancelled = true;
      };
    }

    void Linking.getInitialURL().then((url) => {
      if (url) void run(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void run(url);
    });

    const fallback = setTimeout(() => {
      void run(null);
    }, 600);

    return () => {
      cancelled = true;
      subscription.remove();
      clearTimeout(fallback);
    };
  }, []);

  if (state === 'loading') {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Signing you in…</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.centered}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceBorder }]}>
        <Ionicons name="alert-circle-outline" size={56} color={colors.textSecondary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Sign in failed</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {detail ?? 'Something went wrong. Please try again.'}
      </Text>
      <Pressable
        onPress={() => router.replace('/account')}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.onAccent }]}>Back to sign in</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 12 },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
});

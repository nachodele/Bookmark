import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { createSessionFromAuthUrl } from '@/lib/auth/session-from-url';
import { isWeb } from '@/lib/platform';
import { useTheme } from '@/contexts/ThemeContext';

type CallbackState = 'loading' | 'success' | 'error';

export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const [state, setState] = useState<CallbackState>('loading');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const initial = await Linking.getInitialURL();
        const href = isWeb && typeof window !== 'undefined' ? window.location.href : initial;

        if (!href || !href.includes('auth/callback')) {
          setState('error');
          setDetail('This verification link is invalid or has expired.');
          return;
        }

        const result = await createSessionFromAuthUrl(href);

        if (isWeb && typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/auth/callback');
        }

        if (result.ok) {
          setState('success');
          setTimeout(() => router.replace('/'), 1200);
          return;
        }

        setState('error');
        setDetail(result.error ?? 'Could not verify your account.');
      } catch (error) {
        setState('error');
        setDetail(error instanceof Error ? error.message : 'Something went wrong.');
      }
    };

    void run();
  }, []);

  return (
    <Screen style={styles.centered}>
      {state === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Verifying your email…</Text>
        </>
      ) : null}

      {state === 'success' ? (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Account verified!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            You're signed in. Opening Bookmark…
          </Text>
        </>
      ) : null}

      {state === 'error' ? (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.surfaceBorder }]}>
            <Ionicons name="alert-circle-outline" size={56} color={colors.textSecondary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Verification failed</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {detail ?? 'Try signing in — your account may already be verified.'}
          </Text>
          <Pressable
            onPress={() => router.replace('/account')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>Go to sign in</Text>
          </Pressable>
        </>
      ) : null}
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

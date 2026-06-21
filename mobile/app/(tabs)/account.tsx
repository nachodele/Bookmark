import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { validateSignUp } from '@/lib/utils/auth';
import { PasswordInput } from '@/components/PasswordInput';
import { InfoModal } from '@/components/InfoModal';
import { Screen } from '@/components/Screen';
import { ABOUT, FAQ, SUPPORT } from '@/lib/content/info';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { finishOAuthSignIn } from '@/lib/auth/oauth-flow';
import { setOnboardingPending } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase/client';

type InfoView = 'about' | 'faq' | 'support' | null;

function MenuRow({
  icon,
  label,
  onPress,
  colors,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        {
          backgroundColor: colors.surface,
          borderColor: colors.surfaceBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.accent} />
      <Text style={[styles.menuLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { user, loading, signIn, signUp, signInWithOAuth, signOut } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [infoView, setInfoView] = useState<InfoView>(null);
  const [goHomeAfterAuth, setGoHomeAfterAuth] = useState(false);

  useEffect(() => {
    if (!goHomeAfterAuth || !user) return;
    setGoHomeAfterAuth(false);
    router.replace('/');
  }, [goHomeAfterAuth, user]);

  const toggleAuthMode = () => {
    setIsSignUp((v) => !v);
    setEmailConfirm('');
    setPasswordConfirm('');
    setMessage(null);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setSubmitting(true);
    setMessage(null);

    const result = await signInWithOAuth(provider);

    if (result.error) {
      setMessage(result.error);
      setSubmitting(false);
      return;
    }

    if (result.cancelled) {
      setSubmitting(false);
      return;
    }

    if (result.user) {
      await finishOAuthSignIn(result.user);
    }

    setSubmitting(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    const trimmedEmail = email.trim();

    if (isSignUp) {
      const validationError = validateSignUp(trimmedEmail, emailConfirm, password, passwordConfirm);
      if (validationError) {
        setMessage(validationError);
        setSubmitting(false);
        return;
      }
    }

    const action = isSignUp ? signUp : signIn;
    const { error } = await action(trimmedEmail, password);

    if (error) {
      setMessage(error);
    } else if (isSignUp) {
      await setOnboardingPending();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await signOut();
        setMessage('Account created. Sign in to get started.');
        setIsSignUp(false);
        setPassword('');
        setPasswordConfirm('');
        setEmailConfirm('');
      } else {
        setMessage('Account created. Check your email to confirm your account.');
        setIsSignUp(false);
        setPassword('');
        setPasswordConfirm('');
        setEmailConfirm('');
      }
    } else {
      setGoHomeAfterAuth(true);
    }
    setSubmitting(false);
  };

  const canSubmit = isSignUp
    ? Boolean(email && emailConfirm && password && passwordConfirm)
    : Boolean(email && password);

  if (loading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={styles.authContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.logoCircle, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="bookmark" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Bookmark</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Save and organize links with AI
          </Text>

          <SocialAuthButtons disabled={submitting} onPress={handleOAuth} />

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={[styles.input, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}
          />
          {isSignUp ? (
            <TextInput
              value={emailConfirm}
              onChangeText={setEmailConfirm}
              placeholder="Confirm email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={[styles.input, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}
            />
          ) : null}
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            autoComplete={isSignUp ? 'new-password' : 'password'}
          />
          {isSignUp ? (
            <>
              <PasswordInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Min. 8 characters, 1 uppercase, 1 lowercase, 1 number
              </Text>
            </>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !canSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.accent, opacity: pressed || submitting ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>
              {submitting ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>

          <Pressable onPress={toggleAuthMode}>
            <Text style={[styles.link, { color: colors.accent }]}>
              {isSignUp ? 'Already have an account? Sign in' : 'Create account'}
            </Text>
          </Pressable>

          {message ? (
            <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.loggedIn}>
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>
              {(user.email?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={[styles.profileLabel, { color: colors.textSecondary }]}>Signed in as</Text>
            <Text style={[styles.email, { color: colors.text }]}>{user.email}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GENERAL</Text>
        <View style={styles.menuGroup}>
          <MenuRow icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} colors={colors} />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>HELP</Text>
        <View style={styles.menuGroup}>
          <MenuRow icon="information-circle-outline" label="About Bookmark" onPress={() => setInfoView('about')} colors={colors} />
          <MenuRow icon="help-circle-outline" label="FAQ" onPress={() => setInfoView('faq')} colors={colors} />
          <MenuRow icon="mail-outline" label="Support" onPress={() => setInfoView('support')} colors={colors} />
        </View>

        <MenuRow icon="log-out-outline" label="Sign out" onPress={signOut} colors={colors} danger />
      </ScrollView>

      <InfoModal visible={infoView === 'about'} title={ABOUT.title} onClose={() => setInfoView(null)}>
        <Text style={[styles.infoBody, { color: colors.textSecondary }]}>{ABOUT.body}</Text>
      </InfoModal>

      <InfoModal visible={infoView === 'faq'} title="FAQ" onClose={() => setInfoView(null)}>
        {FAQ.map((item) => (
          <View key={item.q} style={styles.faqItem}>
            <Text style={[styles.faqQ, { color: colors.text }]}>{item.q}</Text>
            <Text style={[styles.faqA, { color: colors.textSecondary }]}>{item.a}</Text>
          </View>
        ))}
      </InfoModal>

      <InfoModal visible={infoView === 'support'} title={SUPPORT.title} onClose={() => setInfoView(null)}>
        <Text style={[styles.infoBody, { color: colors.textSecondary }]}>{SUPPORT.body}</Text>
        <Pressable onPress={() => Linking.openURL('mailto:supportbookmark@gmail.com')}>
          <Text style={[styles.link, { color: colors.accent, marginTop: 16 }]}>Email supportbookmark@gmail.com</Text>
        </Pressable>
      </InfoModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authContainer: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 12, paddingBottom: 40 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  primaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', marginTop: 8, fontSize: 15, fontWeight: '600' },
  message: { textAlign: 'center', marginTop: 8, fontSize: 14 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: -4 },
  loggedIn: { padding: 20, paddingTop: 48, paddingBottom: 40, gap: 12 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700' },
  profileMeta: { flex: 1, gap: 2 },
  profileLabel: { fontSize: 13 },
  email: { fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 12, marginBottom: 4 },
  menuGroup: { gap: 8 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  infoBody: { fontSize: 15, lineHeight: 24 },
  faqItem: { marginBottom: 20, gap: 6 },
  faqQ: { fontSize: 16, fontWeight: '600' },
  faqA: { fontSize: 15, lineHeight: 22 },
});

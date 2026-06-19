import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PENDING_SHARE_KEY } from '@/lib/share/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useTheme } from '@/contexts/ThemeContext';
import { saveBookmark } from '@/lib/api/share';
import { isWeb } from '@/lib/platform';
import { detectSourceApp, extractUrl } from '@/lib/utils/source';

export default function SaveScreen() {
  const { user, session } = useAuth();
  const { colors } = useTheme();
  const isOnline = useIsOnline();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );

  const showFeedback = useCallback((message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3500);
  }, []);

  useEffect(() => {
    if (!isWeb) return;

    AsyncStorage.getItem(PENDING_SHARE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const pending = JSON.parse(raw) as { url: string };
        if (pending.url) setUrl(pending.url);
      } catch {
        // ignore malformed pending share
      }
    });
  }, []);

  const handlePaste = async () => {
    if (!isWeb || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      const extracted = extractUrl(text);
      setUrl(extracted ?? text.trim());
    } catch {
      showFeedback('Could not read clipboard — paste manually', 'error');
    }
  };

  const handleSave = async () => {
    const normalizedUrl = extractUrl(url) ?? url.trim();
    if (!normalizedUrl) {
      showFeedback('Enter a valid URL', 'error');
      return;
    }

    if (!user || !session?.access_token) {
      showFeedback('Sign in to save links', 'error');
      return;
    }

    if (!isOnline) {
      showFeedback('Connect to the internet to save', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await saveBookmark(session.access_token, {
        url: normalizedUrl,
        title: '',
        source_app: detectSourceApp(normalizedUrl),
      });
      setUrl('');
      showFeedback(`Saved to ${result.board_name ?? 'your board'}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save link';
      if (Platform.OS === 'web') {
        showFeedback(message, 'error');
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <OfflineBanner />
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Save a link</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Paste a URL — AI picks the board and writes the title for you.
        </Text>

        <View style={styles.field}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.background },
            ]}
          />
          {isWeb ? (
            <Pressable onPress={handlePaste} style={({ pressed }) => [styles.pasteBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: '600' }}>Paste from clipboard</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving || !url.trim()}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: colors.accent,
              opacity: saving || !url.trim() ? 0.5 : pressed ? 0.9 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="bookmark" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save link</Text>
            </>
          )}
        </Pressable>

        {feedback ? (
          <View
            style={[
              styles.feedback,
              { backgroundColor: feedback.type === 'success' ? colors.success : colors.danger },
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 20, gap: 20 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 22 },
  field: { gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  feedback: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  feedbackText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});

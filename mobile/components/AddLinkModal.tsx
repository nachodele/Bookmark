import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { isWeb } from '@/lib/platform';
import { extractUrl } from '@/lib/utils/source';

type AddLinkModalProps = {
  visible: boolean;
  initialUrl?: string;
  onAnalyze: (url: string) => void;
  onClose: () => void;
};

export function AddLinkModal({ visible, initialUrl = '', onAnalyze, onClose }: AddLinkModalProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (visible) setUrl(initialUrl);
  }, [visible, initialUrl]);

  const normalizedUrl = useMemo(() => extractUrl(url) ?? url.trim(), [url]);
  const canAnalyze = normalizedUrl.length > 0;

  const handlePasteUrl = async () => {
    if (!isWeb || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      const extracted = extractUrl(text);
      setUrl(extracted ?? text.trim());
    } catch {
      Alert.alert('Clipboard', 'Could not read clipboard — paste manually');
    }
  };

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    onAnalyze(normalizedUrl);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Add link</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Paste a URL — AI will suggest board, title, and thumbnail for you to review
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.textSecondary }]}>URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              style={[styles.input, inputStyle(colors)]}
            />
            {isWeb ? (
              <Pressable onPress={handlePasteUrl} style={styles.pasteRow}>
                <Ionicons name="clipboard-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>Paste</Text>
              </Pressable>
            ) : null}

            {canAnalyze ? (
              <Pressable
                onPress={handleAnalyze}
                style={({ pressed }) => [
                  styles.analyzeBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Ionicons name="sparkles" size={18} color={colors.onAccent} />
                <Text style={[styles.analyzeBtnText, { color: colors.onAccent }]}>Analyze with AI</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function inputStyle(colors: ReturnType<typeof useTheme>['colors']) {
  return {
    color: colors.text,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.background,
  };
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { padding: 20, paddingTop: 8, gap: 8, paddingBottom: 32 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  pasteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 4 },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  analyzeBtnText: { fontSize: 16, fontWeight: '700' },
});

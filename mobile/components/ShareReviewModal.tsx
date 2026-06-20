import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { fetchBoards } from '@/lib/api/boards';
import { confirmShareBookmark, type ShareConfirmPayload } from '@/lib/api/share';
import type { Board } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';
import type { ShareReviewDraft } from '@/hooks/useShareHandler';

type ShareReviewModalProps = {
  visible: boolean;
  loading: boolean;
  draft: ShareReviewDraft | null;
  accessToken: string | null;
  onClose: () => void;
  onSaved: (boardName: string) => void;
};

export function ShareReviewModal({
  visible,
  loading,
  draft,
  accessToken,
  onClose,
  onSaved,
}: ShareReviewModalProps) {
  const { colors } = useTheme();
  const [boards, setBoards] = useState<Board[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [suggestedBoardName, setSuggestedBoardName] = useState('');
  const [useSuggestedBoard, setUseSuggestedBoard] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !draft?.userId) return;

    void fetchBoards(draft.userId).then((data) => {
      setBoards(
        data.map(({ id, user_id, name, cover_url, created_at }) => ({
          id,
          user_id,
          name,
          cover_url,
          created_at,
        })),
      );
    });
  }, [visible, draft?.userId]);

  useEffect(() => {
    if (!visible || !draft) return;

    setTitle(draft.title);
    setDescription(draft.description);
    setSuggestedBoardName(draft.boardName);
    if (draft.boardId) {
      setBoardId(draft.boardId);
      setUseSuggestedBoard(false);
    } else {
      setBoardId(null);
      setUseSuggestedBoard(true);
    }
  }, [visible, draft]);

  const handleSave = async () => {
    if (!draft || !accessToken) return;

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
      Alert.alert('Review save', 'Title and description are required');
      return;
    }

    if (!boardId && !useSuggestedBoard) {
      Alert.alert('Review save', 'Pick a board or accept the AI suggestion');
      return;
    }

    const payload: ShareConfirmPayload = {
      url: draft.url,
      title: trimmedTitle,
      description: trimmedDescription,
      source_app: draft.sourceApp,
      thumbnail_url: draft.thumbnailUrl,
    };

    if (boardId && !useSuggestedBoard) {
      payload.board_id = boardId;
    } else {
      payload.board_name = suggestedBoardName.trim() || draft.boardName;
    }

    setSaving(true);
    try {
      const result = await confirmShareBookmark(accessToken, payload);
      onSaved(result.board_name ?? payload.board_name ?? 'your board');
      onClose();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not save link');
    } finally {
      setSaving(false);
    }
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
              <Text style={[styles.title, { color: colors.text }]}>Review save</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                AI suggestion — edit before saving
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} disabled={loading || saving}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Analyzing link with AI…
              </Text>
            </View>
          ) : draft ? (
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              {draft.thumbnailUrl ? (
                <Image source={{ uri: draft.thumbnailUrl }} style={styles.thumbnail} />
              ) : null}

              <Text style={[styles.label, { color: colors.textSecondary }]}>URL</Text>
              <Text style={[styles.urlText, { color: colors.textMuted }]} numberOfLines={2}>
                {draft.url}
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Link title"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, inputStyle(colors)]}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this about?"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.textArea, inputStyle(colors)]}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>Board</Text>
              {useSuggestedBoard && draft.isNewBoard ? (
                <View
                  style={[
                    styles.suggestedBoard,
                    { borderColor: colors.accent, backgroundColor: colors.accentMuted },
                  ]}
                >
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                  <View style={styles.suggestedMeta}>
                    <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 15 }}>
                      {suggestedBoardName || draft.boardName}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>New board (AI)</Text>
                  </View>
                </View>
              ) : null}

              {boards.length > 0 ? (
                <View style={styles.boardList}>
                  {boards.map((board) => {
                    const selected = !useSuggestedBoard && boardId === board.id;
                    return (
                      <Pressable
                        key={board.id}
                        onPress={() => {
                          setUseSuggestedBoard(false);
                          setBoardId(board.id);
                        }}
                        style={[
                          styles.boardChip,
                          {
                            borderColor: selected ? colors.accent : colors.surfaceBorder,
                            backgroundColor: selected ? colors.accent + '22' : colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selected ? colors.accent : colors.text,
                            fontWeight: selected ? '700' : '500',
                          }}
                        >
                          {board.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {draft.isNewBoard && boards.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setUseSuggestedBoard(true);
                    setBoardId(null);
                  }}
                  style={({ pressed }) => [styles.aiLink, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>
                    Use AI board: {draft.boardName}
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: colors.surfaceBorder, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: colors.accent, opacity: saving ? 0.6 : pressed ? 0.9 : 1 },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 16 }}>
                      Save link
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
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
  loadingWrap: { alignItems: 'center', justifyContent: 'center', padding: 48, gap: 16 },
  loadingText: { fontSize: 15, textAlign: 'center' },
  form: { padding: 20, paddingTop: 8, gap: 8, paddingBottom: 32 },
  thumbnail: { width: '100%', height: 140, borderRadius: 14, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 },
  urlText: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  textArea: { minHeight: 88 },
  suggestedBoard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  suggestedMeta: { flex: 1, gap: 2 },
  boardList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  boardChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  aiLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
});

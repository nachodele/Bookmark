import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { createBoard } from '@/lib/api/boards';
import { createManualBookmark } from '@/lib/api/manual-save';
import type { Board } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';
import { isWeb } from '@/lib/platform';
import { extractUrl } from '@/lib/utils/source';

type AddLinkModalProps = {
  visible: boolean;
  userId: string;
  boards: Board[];
  initialUrl?: string;
  presetBoardId?: string;
  lockBoard?: boolean;
  /** Web/PWA: URL only → save-bookmark AI preview (same as native share). */
  useAiPreview?: boolean;
  onAiPreview?: (url: string) => void;
  onClose: () => void;
  onSaved: () => void;
  onRequestNewBoard: () => void;
};

export function AddLinkModal({
  visible,
  userId,
  boards,
  initialUrl = '',
  presetBoardId,
  lockBoard = false,
  useAiPreview = false,
  onAiPreview,
  onClose,
  onSaved,
  onRequestNewBoard,
}: AddLinkModalProps) {
  const { colors } = useTheme();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setUrl(initialUrl);
      setTitle('');
      setDescription('');
      if (presetBoardId) {
        setBoardId(presetBoardId);
      } else {
        setBoardId(boards.length === 1 ? boards[0]?.id ?? null : null);
      }
      setCreatingBoard(false);
      setNewBoardName('');
    }
  }, [visible, initialUrl, boards, presetBoardId]);

  const presetBoardName = presetBoardId
    ? boards.find((b) => b.id === presetBoardId)?.name
    : undefined;

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

  const handleCreateInlineBoard = async () => {
    if (!newBoardName.trim()) return;
    setSaving(true);
    try {
      const board = await createBoard(userId, newBoardName);
      setBoardId(board.id);
      setCreatingBoard(false);
      setNewBoardName('');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not create board');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const normalizedUrl = extractUrl(url) ?? url.trim();
    if (!normalizedUrl) {
      Alert.alert('Add link', 'Enter a valid URL');
      return;
    }

    if (useAiPreview) {
      onAiPreview?.(normalizedUrl);
      onClose();
      return;
    }

    if (!title.trim() || !description.trim()) {
      Alert.alert('Add link', 'Title and description are required');
      return;
    }
    if (!boardId) {
      Alert.alert('Add link', 'Pick a board or create one');
      return;
    }

    setSaving(true);
    try {
      await createManualBookmark(userId, {
        url: normalizedUrl,
        title: title.trim(),
        description: description.trim(),
        boardId,
      });
      onSaved();
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
              <Text style={[styles.title, { color: colors.text }]}>Add link</Text>
              {useAiPreview ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  AI will suggest board, title, and thumbnail — edit before saving
                </Text>
              ) : null}
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
              style={[styles.input, inputStyle(colors)]}
            />
            {isWeb ? (
              <Pressable onPress={handlePasteUrl} style={styles.pasteRow}>
                <Ionicons name="clipboard-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 14 }}>Paste</Text>
              </Pressable>
            ) : null}

            {!useAiPreview ? (
              <>
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
            {lockBoard && presetBoardId ? (
              <View
                style={[
                  styles.lockedBoard,
                  { borderColor: colors.accent, backgroundColor: colors.accentMuted },
                ]}
              >
                <Ionicons name="albums" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 15 }}>
                  {presetBoardName ?? 'This board'}
                </Text>
              </View>
            ) : boards.length === 0 && !creatingBoard ? (
              <View style={styles.emptyBoards}>
                <Text style={{ color: colors.textSecondary, lineHeight: 22 }}>
                  No boards yet. Create one below or from the home screen.
                </Text>
              </View>
            ) : (
              <View style={styles.boardList}>
                {boards.map((board) => {
                  const selected = boardId === board.id;
                  return (
                    <Pressable
                      key={board.id}
                      onPress={() => setBoardId(board.id)}
                      style={[
                        styles.boardChip,
                        {
                          borderColor: selected ? colors.accent : colors.surfaceBorder,
                          backgroundColor: selected ? colors.accent + '22' : colors.background,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? colors.accent : colors.text, fontWeight: selected ? '700' : '500' }}>
                        {board.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {!lockBoard && creatingBoard ? (
              <View style={styles.inlineBoard}>
                <TextInput
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  placeholder="New board name"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, inputStyle(colors)]}
                  autoFocus
                />
                <View style={styles.inlineBoardActions}>
                  <Pressable onPress={() => setCreatingBoard(false)}>
                    <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleCreateInlineBoard} disabled={saving || !newBoardName.trim()}>
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Create & select</Text>
                  </Pressable>
                </View>
              </View>
            ) : !lockBoard ? (
              <Pressable
                onPress={() => (boards.length === 0 ? setCreatingBoard(true) : onRequestNewBoard())}
                style={({ pressed }) => [styles.newBoardLink, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '600' }}>Create new board</Text>
              </Pressable>
            ) : null}
              </>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: colors.accent, opacity: saving ? 0.6 : pressed ? 0.9 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.onAccent }]}>
                  {useAiPreview ? 'Analyze with AI' : 'Save link'}
                </Text>
              )}
            </Pressable>
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
  textArea: { minHeight: 88 },
  pasteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 4 },
  boardList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  boardChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  lockedBoard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  emptyBoards: { marginVertical: 8 },
  newBoardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 8 },
  inlineBoard: { gap: 10, marginTop: 8 },
  inlineBoardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  saveBtnText: { fontSize: 16, fontWeight: '700' },
});

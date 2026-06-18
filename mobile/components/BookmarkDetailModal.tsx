import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BookmarkWithBoard } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';
import { detectSourceApp, faviconUrl } from '@/lib/utils/source';

type BookmarkDetailModalProps = {
  visible: boolean;
  bookmark: BookmarkWithBoard | null;
  onClose: () => void;
  onMove: () => void;
  onSave: (updates: { title: string; description: string }) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function BookmarkDetailModal({
  visible,
  bookmark,
  onClose,
  onMove,
  onSave,
  onDelete,
}: BookmarkDetailModalProps) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title ?? '');
      setDescription(bookmark.description ?? '');
      setEditing(false);
    }
  }, [bookmark]);

  if (!bookmark) return null;

  const source = bookmark.source_app ?? detectSourceApp(bookmark.url);
  const thumb = bookmark.thumbnail_url ?? faviconUrl(bookmark.url);

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({ title: title.trim(), description: description.trim() });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
          <Pressable
            onPress={() => (editing ? setEditing(false) : onClose())}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
            <Text style={[styles.backLabel, { color: colors.accent }]}>
              {editing ? 'Cancel' : 'Back'}
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={2}>
            {editing ? 'Edit link' : bookmark.title || 'Link'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {!editing && thumb ? (
            <Image source={{ uri: thumb }} style={styles.heroImage} />
          ) : null}

          {editing ? (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={[styles.input, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}
              />
              <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                style={[styles.inputMultiline, { color: colors.text, borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}
              />
              <Pressable
                onPress={handleSave}
                disabled={busy || !title.trim()}
                style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Saving...' : 'Save changes'}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {bookmark.title || bookmark.url}
              </Text>
              {bookmark.description ? (
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {bookmark.description}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={[styles.meta, { color: colors.accent }]}>{source}</Text>
                {bookmark.board?.name ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{bookmark.board.name}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => Linking.openURL(bookmark.url)}
                style={[styles.urlBox, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
              >
                <Ionicons name="link-outline" size={18} color={colors.accent} />
                <Text style={[styles.url, { color: colors.accent }]} selectable>
                  {bookmark.url}
                </Text>
                <Ionicons name="open-outline" size={16} color={colors.textMuted} />
              </Pressable>
            </>
          )}
        </ScrollView>

        {!editing ? (
          <View style={[styles.actions, { borderTopColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
            <Pressable onPress={() => setEditing(true)} style={styles.actionBtn}>
              <Ionicons name="create-outline" size={22} color={colors.text} />
              <Text style={[styles.actionLabel, { color: colors.text }]}>Edit</Text>
            </Pressable>
            <Pressable onPress={onMove} style={styles.actionBtn}>
              <Ionicons name="folder-outline" size={22} color={colors.text} />
              <Text style={[styles.actionLabel, { color: colors.text }]}>Move</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
              <Text style={[styles.actionLabel, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backLabel: { fontSize: 17, fontWeight: '500' },
  headerTitle: { fontSize: 22, fontWeight: '700', paddingHorizontal: 4 },
  body: { padding: 20, gap: 14, paddingBottom: 24 },
  heroImage: { width: '100%', height: 180, borderRadius: 14 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  description: { fontSize: 16, lineHeight: 24 },
  metaRow: { flexDirection: 'row', gap: 12 },
  meta: { fontSize: 14, fontWeight: '600' },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  url: { flex: 1, fontSize: 14, lineHeight: 20 },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  inputMultiline: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  actionLabel: { fontSize: 12, fontWeight: '600' },
});

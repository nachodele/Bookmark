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
import { ThumbnailEditor } from '@/components/ThumbnailEditor';

type BookmarkDetailModalProps = {
  visible: boolean;
  bookmark: BookmarkWithBoard | null;
  userId: string | null;
  onClose: () => void;
  onOpenBoards: () => void;
  onSave: (updates: {
    title: string;
    description: string;
    thumbnail_url?: string | null;
    keywords?: string[];
  }) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function BookmarkDetailModal({
  visible,
  bookmark,
  userId,
  onClose,
  onOpenBoards,
  onSave,
  onDelete,
}: BookmarkDetailModalProps) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title ?? '');
      setDescription(bookmark.description ?? '');
      setThumbnailUrl(bookmark.thumbnail_url ?? null);
      setKeywords(bookmark.keywords ?? []);
      setKwInput('');
      setEditing(false);
    }
  }, [bookmark]);

  if (!bookmark) return null;

  const source = bookmark.source_app ?? detectSourceApp(bookmark.url);
  const thumb = bookmark.thumbnail_url ?? faviconUrl(bookmark.url);
  const allBoards = [
    ...(bookmark.board ? [bookmark.board] : []),
    ...(bookmark.extra_boards ?? []),
  ];

  const addKeyword = () => {
    const kw = kwInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) setKeywords((prev) => [...prev, kw]);
    setKwInput('');
  };

  const removeKeyword = (kw: string) => setKeywords((prev) => prev.filter((k) => k !== kw));

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        thumbnail_url: thumbnailUrl,
        keywords,
      });
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
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {editing ? 'Edit link' : (bookmark.board?.name ?? 'Link')}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {!editing && thumb ? (
            <Image source={{ uri: thumb }} style={styles.heroImage} />
          ) : null}

          {editing ? (
            <View style={styles.form}>
              {userId ? (
                <ThumbnailEditor
                  userId={userId}
                  linkUrl={bookmark.url}
                  thumbnailUrl={thumbnailUrl}
                  onChange={setThumbnailUrl}
                  colors={colors}
                />
              ) : null}
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
              <Text style={[styles.label, { color: colors.textSecondary }]}>Keywords</Text>
              <View style={[styles.kwInputRow, { borderColor: colors.surfaceBorder, backgroundColor: colors.surface }]}>
                <TextInput
                  value={kwInput}
                  onChangeText={setKwInput}
                  onSubmitEditing={addKeyword}
                  placeholder="Add keyword…"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  style={[styles.kwInput, { color: colors.text }]}
                  blurOnSubmit={false}
                />
                <Pressable onPress={addKeyword} hitSlop={8}>
                  <Ionicons name="add-circle" size={22} color={colors.accent} />
                </Pressable>
              </View>
              {keywords.length > 0 ? (
                <View style={styles.kwChips}>
                  {keywords.map((kw) => (
                    <Pressable
                      key={kw}
                      onPress={() => removeKeyword(kw)}
                      style={[styles.kwChip, { backgroundColor: colors.accentMuted }]}
                    >
                      <Text style={[styles.kwChipText, { color: colors.accent }]}>{kw}</Text>
                      <Ionicons name="close" size={12} color={colors.accent} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Pressable
                onPress={handleSave}
                disabled={busy || !title.trim()}
                style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
              >
                <Text style={[styles.primaryBtnText, { color: colors.onAccent }]}>{busy ? 'Saving...' : 'Save changes'}</Text>
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
              {(bookmark.keywords?.length ?? 0) > 0 ? (
                <View style={styles.kwChips}>
                  {bookmark.keywords!.map((kw) => (
                    <View key={kw} style={[styles.kwChip, { backgroundColor: colors.accentMuted }]}>
                      <Text style={[styles.kwChipText, { color: colors.accent }]}>{kw}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={[styles.meta, { color: colors.accent }]}>{source}</Text>
                {allBoards.map((b) => (
                  <Text key={b.id} style={[styles.meta, { color: colors.textMuted }]}>{b.name}</Text>
                ))}
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
            <Pressable onPress={onOpenBoards} style={styles.actionBtn}>
              <Ionicons name="albums-outline" size={22} color={colors.text} />
              <Text style={[styles.actionLabel, { color: colors.text }]}>Boards</Text>
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
  kwChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kwChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kwChipText: { fontSize: 13, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
  kwInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  kwInput: { flex: 1, fontSize: 15 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  actionLabel: { fontSize: 12, fontWeight: '600' },
});

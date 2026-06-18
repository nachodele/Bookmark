import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BookmarkWithBoard } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type BookmarkActionsModalProps = {
  visible: boolean;
  bookmark: BookmarkWithBoard | null;
  onClose: () => void;
  onMove: () => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function BookmarkActionsModal({
  visible,
  bookmark,
  onClose,
  onMove,
  onRename,
  onDelete,
}: BookmarkActionsModalProps) {
  const { colors } = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  if (!bookmark) return null;

  const startRename = () => {
    setTitle(bookmark.title ?? bookmark.url);
    setRenaming(true);
  };

  const confirmRename = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onRename(title.trim());
      setRenaming(false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete link', 'Remove this bookmark permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await onDelete();
            onClose();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]}>
          {renaming ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>Rename</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                autoFocus
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.surfaceBorder,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              <View style={styles.actions}>
                <Pressable onPress={() => setRenaming(false)}>
                  <Text style={{ color: colors.textSecondary }}>Back</Text>
                </Pressable>
                <Pressable onPress={confirmRename} disabled={busy}>
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>
                    {busy ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {bookmark.title || bookmark.url}
              </Text>
              {bookmark.board?.name ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  in {bookmark.board.name}
                </Text>
              ) : null}
              <Pressable onPress={onMove} style={styles.option}>
                <Text style={[styles.optionText, { color: colors.text }]}>Move to board</Text>
              </Pressable>
              <Pressable onPress={startRename} style={styles.option}>
                <Text style={[styles.optionText, { color: colors.text }]}>Rename</Text>
              </Pressable>
              <Pressable onPress={confirmDelete} style={styles.option}>
                <Text style={[styles.optionText, { color: colors.danger }]}>Delete</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.cancel}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  option: {
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 16,
  },
  cancel: {
    alignItems: 'center',
    paddingTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});

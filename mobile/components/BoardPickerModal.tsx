import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Board } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type BoardPickerModalProps = {
  visible: boolean;
  boards: Board[];
  currentBoardId?: string | null;
  onSelect: (boardId: string) => void;
  onClose: () => void;
  /** Multi-select mode: show checkboxes and a Done button */
  multiSelect?: boolean;
  selectedBoardIds?: string[];
  onSelectMultiple?: (boardIds: string[]) => void;
};

export function BoardPickerModal({
  visible,
  boards,
  currentBoardId,
  onSelect,
  onClose,
  multiSelect = false,
  selectedBoardIds = [],
  onSelectMultiple,
}: BoardPickerModalProps) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string[]>(selectedBoardIds);

  // Sync when modal opens
  const handleOpen = () => setSelected(selectedBoardIds);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (multiSelect) {
    return (
      <Modal visible={visible} transparent animationType="slide" onShow={handleOpen}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.text }]}>Boards</Text>
            <ScrollView style={styles.list}>
              {boards.map((board) => {
                const checked = selected.includes(board.id);
                return (
                  <Pressable
                    key={board.id}
                    onPress={() => toggle(board.id)}
                    style={[styles.row, { borderColor: colors.surfaceBorder }]}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.rowText, { color: colors.text }]}>{board.name}</Text>
                  </Pressable>
                );
              })}
              {boards.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  No boards yet. Create one from Home.
                </Text>
              ) : null}
            </ScrollView>
            <View style={styles.multiActions}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onSelectMultiple?.(selected);
                  onClose();
                }}
                style={[styles.doneBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={{ color: colors.onAccent, fontWeight: '700' }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Move to board</Text>
          <ScrollView style={styles.list}>
            {boards.map((board) => (
              <Pressable
                key={board.id}
                onPress={() => {
                  onSelect(board.id);
                  onClose();
                }}
                style={[
                  styles.row,
                  {
                    borderColor: colors.surfaceBorder,
                    backgroundColor:
                      board.id === currentBoardId ? colors.accentMuted : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.rowText, { color: colors.text }]}>{board.name}</Text>
                {board.id === currentBoardId ? (
                  <Text style={{ color: colors.accent, fontSize: 12 }}>Current</Text>
                ) : null}
              </Pressable>
            ))}
            {boards.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                No boards yet. Create one from Home.
              </Text>
            ) : null}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={{ color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
  },
  empty: {
    textAlign: 'center',
    padding: 24,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  multiActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
});

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Board } from '@/lib/supabase/database.types';
import { useTheme } from '@/contexts/ThemeContext';

type BoardPickerModalProps = {
  visible: boolean;
  boards: Board[];
  currentBoardId?: string | null;
  onSelect: (boardId: string) => void;
  onClose: () => void;
};

export function BoardPickerModal({
  visible,
  boards,
  currentBoardId,
  onSelect,
  onClose,
}: BoardPickerModalProps) {
  const { colors } = useTheme();

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  rowText: {
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
});

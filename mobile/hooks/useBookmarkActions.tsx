import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { Board, BookmarkWithBoard } from '@/lib/supabase/database.types';
import { deleteBookmark, updateBookmark } from '@/lib/api/bookmarks';
import { fetchBoardNames, moveBookmark } from '@/lib/api/boards';
import { BookmarkActionsModal } from '@/components/BookmarkActionsModal';
import { BoardPickerModal } from '@/components/BoardPickerModal';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';

export function useBookmarkActions(onChanged?: () => void) {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [selected, setSelected] = useState<BookmarkWithBoard | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const openActions = useCallback((bookmark: BookmarkWithBoard) => {
    setSelected(bookmark);
  }, []);

  const closeActions = useCallback(() => {
    setSelected(null);
    setPickerVisible(false);
  }, []);

  const requireOnline = () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Connect to the internet to make changes.');
      return false;
    }
    return true;
  };

  const openMovePicker = async () => {
    if (!user || !requireOnline()) return;
    const list = await fetchBoardNames(user.id);
    setBoards(list);
    setPickerVisible(true);
  };

  const handleMove = async (boardId: string) => {
    if (!user || !selected) return;
    await moveBookmark(selected.id, boardId, user.id);
    onChanged?.();
    closeActions();
  };

  const handleRename = async (title: string) => {
    if (!user || !selected || !requireOnline()) return;
    await updateBookmark(selected.id, user.id, { title });
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!user || !selected || !requireOnline()) return;
    await deleteBookmark(selected.id, user.id);
    onChanged?.();
  };

  const modals = (
    <>
      <BookmarkActionsModal
        visible={Boolean(selected) && !pickerVisible}
        bookmark={selected}
        onClose={closeActions}
        onMove={openMovePicker}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <BoardPickerModal
        visible={pickerVisible}
        boards={boards}
        currentBoardId={selected?.board_id}
        onSelect={handleMove}
        onClose={() => setPickerVisible(false)}
      />
    </>
  );

  return { openActions, modals };
}

import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { Board, BookmarkWithBoard } from '@/lib/supabase/database.types';
import { deleteBookmark, updateBookmark } from '@/lib/api/bookmarks';
import { fetchBoardNames, fetchBookmarkBoardIds, setBookmarkBoards } from '@/lib/api/boards';
import { BookmarkDetailModal } from '@/components/BookmarkDetailModal';
import { BoardPickerModal } from '@/components/BoardPickerModal';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';

export function useBookmarkActions(onChanged?: () => void) {
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const [selected, setSelected] = useState<BookmarkWithBoard | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [currentBoardIds, setCurrentBoardIds] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const openDetail = useCallback((bookmark: BookmarkWithBoard) => {
    setSelected(bookmark);
    setPickerVisible(false);
  }, []);

  const closeDetail = useCallback(() => {
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

  const openBoardsPicker = async () => {
    if (!user || !selected || !requireOnline()) return;
    const [list, ids] = await Promise.all([
      fetchBoardNames(user.id),
      fetchBookmarkBoardIds(selected.id, user.id),
    ]);
    setBoards(list);
    setCurrentBoardIds(ids);
    setPickerVisible(true);
  };

  const handleSetBoards = async (boardIds: string[]) => {
    if (!user || !selected) return;
    const primary = boardIds[0] ?? selected.board_id ?? '';
    await setBookmarkBoards(selected.id, user.id, boardIds, primary);
    onChanged?.();
    closeDetail();
  };

  const handleSave = async (updates: {
    title: string;
    description: string;
    thumbnail_url?: string | null;
    keywords?: string[];
  }) => {
    if (!user || !selected || !requireOnline()) return;
    await updateBookmark(selected.id, user.id, updates);
    setSelected((prev) => (prev ? { ...prev, ...updates } : prev));
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!user || !selected || !requireOnline()) return;
    Alert.alert('Delete link', 'Remove this bookmark permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBookmark(selected.id, user.id);
          onChanged?.();
          closeDetail();
        },
      },
    ]);
  };

  const modals = (
    <>
      <BookmarkDetailModal
        visible={Boolean(selected) && !pickerVisible}
        bookmark={selected}
        userId={user?.id ?? null}
        onClose={closeDetail}
        onOpenBoards={openBoardsPicker}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <BoardPickerModal
        visible={pickerVisible}
        boards={boards}
        currentBoardId={selected?.board_id}
        onSelect={() => {}}
        onClose={() => setPickerVisible(false)}
        multiSelect
        selectedBoardIds={currentBoardIds}
        onSelectMultiple={handleSetBoards}
      />
    </>
  );

  return { openDetail, modals };
}

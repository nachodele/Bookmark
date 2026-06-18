import { supabase } from '@/lib/supabase/client';
import type { Board, BoardWithCount } from '@/lib/supabase/database.types';

export async function fetchBoards(userId: string): Promise<BoardWithCount[]> {
  const { data: boards, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!boards?.length) return [];

  const { data: bookmarks, error: bookmarkError } = await supabase
    .from('bookmarks')
    .select('board_id, thumbnail_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (bookmarkError) throw bookmarkError;

  const countByBoard = new Map<string, number>();
  const coverByBoard = new Map<string, string>();

  for (const bookmark of bookmarks ?? []) {
    if (!bookmark.board_id) continue;
    countByBoard.set(bookmark.board_id, (countByBoard.get(bookmark.board_id) ?? 0) + 1);
    if (!coverByBoard.has(bookmark.board_id) && bookmark.thumbnail_url) {
      coverByBoard.set(bookmark.board_id, bookmark.thumbnail_url);
    }
  }

  return boards.map((board) => ({
    ...board,
    bookmark_count: countByBoard.get(board.id) ?? 0,
    cover_url: board.cover_url ?? coverByBoard.get(board.id) ?? null,
  }));
}

export async function createBoard(
  userId: string,
  name: string,
  coverUrl?: string | null,
): Promise<Board> {
  const { data, error } = await supabase
    .from('boards')
    .insert({
      user_id: userId,
      name: name.trim(),
      cover_url: coverUrl ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchBoardBookmarks(boardId: string, userId: string) {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function moveBookmark(
  bookmarkId: string,
  boardId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .update({ board_id: boardId })
    .eq('id', bookmarkId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateBookmarkTitle(
  bookmarkId: string,
  title: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .update({ title: title.trim() })
    .eq('id', bookmarkId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function renameBoard(
  boardId: string,
  name: string,
  userId: string,
): Promise<Board> {
  const { data, error } = await supabase
    .from('boards')
    .update({ name: name.trim() })
    .eq('id', boardId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBoard(boardId: string, userId: string): Promise<void> {
  const { error: bookmarkError } = await supabase
    .from('bookmarks')
    .delete()
    .eq('board_id', boardId)
    .eq('user_id', userId);

  if (bookmarkError) throw bookmarkError;

  const { error } = await supabase
    .from('boards')
    .delete()
    .eq('id', boardId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function fetchBoardNames(userId: string): Promise<Board[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function filterBoardsByName(boards: BoardWithCount[], query: string): BoardWithCount[] {
  const q = query.trim().toLowerCase();
  if (!q) return boards;
  return boards.filter((board) => board.name.toLowerCase().includes(q));
}

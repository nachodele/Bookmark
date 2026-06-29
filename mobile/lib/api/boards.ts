import { supabase } from '@/lib/supabase/client';
import type { Board, BoardWithCount, Bookmark } from '@/lib/supabase/database.types';

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

export async function fetchBoardBookmarks(boardId: string, userId: string): Promise<Bookmark[]> {
  // Primary board
  const { data: primary, error: e1 } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (e1) throw e1;

  // Secondary memberships
  const { data: memberships, error: e2 } = await supabase
    .from('bookmark_board_memberships')
    .select('bookmark_id')
    .eq('board_id', boardId)
    .eq('user_id', userId);
  if (e2) throw e2;

  if (!memberships?.length) return primary ?? [];

  const primaryIds = new Set((primary ?? []).map((b) => b.id));
  const extraIds = memberships.map((m) => m.bookmark_id).filter((id) => !primaryIds.has(id));

  if (!extraIds.length) return primary ?? [];

  const { data: extra, error: e3 } = await supabase
    .from('bookmarks')
    .select('*')
    .in('id', extraIds)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (e3) throw e3;

  return [...(primary ?? []), ...(extra ?? [])];
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

export async function fetchBookmarkBoardIds(
  bookmarkId: string,
  userId: string,
): Promise<string[]> {
  const [{ data: bookmark }, { data: memberships }] = await Promise.all([
    supabase.from('bookmarks').select('board_id').eq('id', bookmarkId).eq('user_id', userId).single(),
    supabase.from('bookmark_board_memberships').select('board_id').eq('bookmark_id', bookmarkId).eq('user_id', userId),
  ]);

  const ids: string[] = [];
  if (bookmark?.board_id) ids.push(bookmark.board_id);
  for (const m of memberships ?? []) {
    if (!ids.includes(m.board_id)) ids.push(m.board_id);
  }
  return ids;
}

export async function setBookmarkBoards(
  bookmarkId: string,
  userId: string,
  boardIds: string[],
  primaryBoardId: string,
): Promise<void> {
  // Update primary board
  const { error: e1 } = await supabase
    .from('bookmarks')
    .update({ board_id: primaryBoardId })
    .eq('id', bookmarkId)
    .eq('user_id', userId);
  if (e1) throw e1;

  // Replace memberships (secondary boards)
  const secondaryIds = boardIds.filter((id) => id !== primaryBoardId);

  const { error: e2 } = await supabase
    .from('bookmark_board_memberships')
    .delete()
    .eq('bookmark_id', bookmarkId)
    .eq('user_id', userId);
  if (e2) throw e2;

  if (secondaryIds.length) {
    const { error: e3 } = await supabase.from('bookmark_board_memberships').insert(
      secondaryIds.map((board_id) => ({ bookmark_id: bookmarkId, board_id, user_id: userId })),
    );
    if (e3) throw e3;
  }
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

export async function updateBoardCover(
  boardId: string,
  coverUrl: string | null,
  userId: string,
): Promise<Board> {
  const { data, error } = await supabase
    .from('boards')
    .update({ cover_url: coverUrl })
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

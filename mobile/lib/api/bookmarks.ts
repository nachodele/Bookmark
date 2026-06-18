import { supabase } from '@/lib/supabase/client';
import type { Bookmark, BookmarkWithBoard } from '@/lib/supabase/database.types';

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function fetchRecentBookmarks(
  userId: string,
  limit = 10,
): Promise<BookmarkWithBoard[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*, board:boards(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookmarkWithBoard[];
}

export async function searchBookmarks(
  userId: string,
  query: string,
): Promise<BookmarkWithBoard[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = `%${escapeIlike(trimmed)}%`;
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*, board:boards(id, name)')
    .eq('user_id', userId)
    .or(
      `title.ilike.${pattern},description.ilike.${pattern},url.ilike.${pattern},source_app.ilike.${pattern}`,
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as BookmarkWithBoard[];
}

export async function deleteBookmark(bookmarkId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateBookmark(
  bookmarkId: string,
  userId: string,
  updates: { title?: string; description?: string; board_id?: string },
): Promise<Bookmark> {
  const { data, error } = await supabase
    .from('bookmarks')
    .update(updates)
    .eq('id', bookmarkId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchAllBookmarks(userId: string): Promise<BookmarkWithBoard[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*, board:boards(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as BookmarkWithBoard[];
}

export function filterBookmarksLocally(
  bookmarks: BookmarkWithBoard[],
  query: string,
): BookmarkWithBoard[] {
  const q = query.trim().toLowerCase();
  if (!q) return bookmarks;

  return bookmarks.filter((b) => {
    const boardName = b.board?.name?.toLowerCase() ?? '';
    return (
      b.title?.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      b.source_app?.toLowerCase().includes(q) ||
      boardName.includes(q)
    );
  });
}

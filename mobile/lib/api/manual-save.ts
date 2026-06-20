import { supabase } from '@/lib/supabase/client';

export type ManualBookmarkInput = {
  url: string;
  title: string;
  description: string;
  boardId: string;
  sourceApp?: string;
  thumbnailUrl?: string | null;
};

export async function createManualBookmark(
  userId: string,
  input: ManualBookmarkInput,
): Promise<{ boardName: string }> {
  const url = input.url.trim();
  const title = input.title.trim();
  const description = input.description.trim();

  if (!url) throw new Error('URL is required');
  if (!title) throw new Error('Title is required');
  if (!description) throw new Error('Description is required');
  if (!input.boardId) throw new Error('Pick a board');

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('id, name')
    .eq('id', input.boardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (boardError) throw boardError;
  if (!board) throw new Error('Board not found');

  const { error } = await supabase.from('bookmarks').insert({
    user_id: userId,
    board_id: board.id,
    url,
    title,
    description,
    source_app: input.sourceApp?.trim() || 'Manual',
    thumbnail_url: input.thumbnailUrl ?? null,
  });

  if (error) {
    if (error.code === '23505') throw new Error('This link is already saved');
    throw error;
  }

  return { boardName: board.name };
}

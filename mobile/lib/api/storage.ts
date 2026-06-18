import { supabase } from '@/lib/supabase/client';

export async function uploadBoardCover(
  userId: string,
  localUri: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('board-covers')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('board-covers').getPublicUrl(path);
  return data.publicUrl;
}

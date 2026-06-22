import { supabase } from '@/lib/supabase/client';

function inferImageContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
}

export async function uploadBoardCover(
  userId: string,
  localUri: string,
): Promise<string> {
  return uploadUserImage(userId, localUri, 'covers');
}

export async function uploadBookmarkThumbnail(
  userId: string,
  localUri: string,
): Promise<string> {
  return uploadUserImage(userId, localUri, 'thumbnails');
}

async function uploadUserImage(
  userId: string,
  localUri: string,
  kind: 'covers' | 'thumbnails',
): Promise<string> {
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`Could not read image (${response.status})`);
  }

  // React Native cannot build Blobs from ArrayBuffer — Supabase expects ArrayBuffer here.
  const fileBody = await response.arrayBuffer();
  const contentType = inferImageContentType(localUri);
  const ext = extensionForContentType(contentType);
  const path = `${userId}/${kind}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('board-covers')
    .upload(path, fileBody, { contentType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('board-covers').getPublicUrl(path);
  return data.publicUrl;
}

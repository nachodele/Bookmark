import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase/client';

// Cover/thumbnail images were being stored at full camera resolution (~8 MB each),
// which is the real driver of storage growth. Downscale + JPEG-compress before upload:
// a 4000px/8 MB photo becomes a ~1080px/~150-300 KB cover with no visible quality loss
// at the sizes we render.
const MAX_IMAGE_DIMENSION = 1080;
const JPEG_QUALITY = 0.7;

/**
 * Resize (longest side ≤ MAX_IMAGE_DIMENSION) and re-encode as JPEG.
 * Returns a new local URI. Falls back to the original URI if manipulation fails.
 */
async function compressImage(localUri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(localUri).resize({
      width: MAX_IMAGE_DIMENSION,
    });
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch (err) {
    console.warn('Image compression failed — uploading original', err);
    return localUri;
  }
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

// Flip to R2 by setting EXPO_PUBLIC_R2_ENABLED=true once the bucket + r2-upload
// edge function secrets are configured. Until then, uploads use Supabase Storage.
const R2_ENABLED = process.env.EXPO_PUBLIC_R2_ENABLED === 'true';

async function uploadUserImage(
  userId: string,
  localUri: string,
  kind: 'covers' | 'thumbnails',
): Promise<string> {
  const compressedUri = await compressImage(localUri);

  const response = await fetch(compressedUri);
  if (!response.ok) {
    throw new Error(`Could not read image (${response.status})`);
  }

  // React Native cannot build Blobs from ArrayBuffer.
  // compressImage always re-encodes to JPEG, so content type is fixed.
  const fileBody = await response.arrayBuffer();
  const contentType = 'image/jpeg';

  if (R2_ENABLED) {
    return uploadToR2(fileBody, contentType, kind);
  }

  const path = `${userId}/${kind}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('board-covers')
    .upload(path, fileBody, { contentType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('board-covers').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload via Cloudflare R2: ask the r2-upload edge function for a presigned PUT URL
 * (credentials stay server-side), PUT the bytes, and return the public read URL.
 */
async function uploadToR2(
  fileBody: ArrayBuffer,
  contentType: string,
  kind: 'covers' | 'thumbnails',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('r2-upload', {
    body: { kind, contentType },
  });
  if (error) throw error;

  const { uploadUrl, publicUrl } = data as { uploadUrl: string; publicUrl: string };

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBody,
  });
  if (!put.ok) {
    throw new Error(`R2 upload failed (${put.status})`);
  }

  return publicUrl;
}

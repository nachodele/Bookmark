export type ShareBookmarkPayload = {
  url: string;
  title: string;
  source_app: string;
};

export type SharePreviewResponse = {
  success: boolean;
  preview?: boolean;
  already_saved?: boolean;
  url?: string;
  title?: string;
  description?: string;
  board_name?: string;
  board_id?: string | null;
  is_new_board?: boolean;
  thumbnail_url?: string | null;
  source_app?: string;
  board_name_saved?: string;
  is_new_board_saved?: boolean;
  error?: string;
};

export type ShareConfirmPayload = {
  url: string;
  title: string;
  description: string;
  source_app: string;
  board_id?: string;
  board_name?: string;
  thumbnail_url?: string | null;
};

async function shareBookmarkRequest(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<SharePreviewResponse> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey || supabaseUrl.includes('your-project')) {
    throw new Error('Supabase is not configured');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/save-bookmark`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as SharePreviewResponse;

  if (!response.ok || !data.success) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data;
}

export async function previewShareBookmark(
  accessToken: string,
  payload: ShareBookmarkPayload,
): Promise<SharePreviewResponse> {
  return shareBookmarkRequest(accessToken, { ...payload, preview: true });
}

export async function confirmShareBookmark(
  accessToken: string,
  payload: ShareConfirmPayload,
): Promise<SharePreviewResponse> {
  return shareBookmarkRequest(accessToken, { ...payload, confirmed: true });
}

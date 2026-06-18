export type SaveBookmarkPayload = {
  url: string;
  title: string;
  source_app: string;
};

export type SaveBookmarkResponse = {
  success: boolean;
  board_name?: string;
  description?: string;
  is_new_board?: boolean;
  error?: string;
};

export async function saveBookmark(
  accessToken: string,
  payload: SaveBookmarkPayload,
): Promise<SaveBookmarkResponse> {
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
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as SaveBookmarkResponse;

  if (!response.ok || !data.success) {
    throw new Error(data.error ?? `Save failed (${response.status})`);
  }

  return data;
}

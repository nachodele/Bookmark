import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PLATFORM_NAMES = new Set([
  'instagram', 'youtube', 'tiktok', 'twitter', 'x', 'facebook', 'web',
  'spotify', 'linkedin', 'reddit', 'pinterest', 'whatsapp', 'snapchat',
]);

const GENERIC_SHARE_TITLES = /^(instagram share|shared from instagram|youtube|tiktok|shared link|web page)$/i;

type ClassifyResult = {
  board_name: string;
  title: string;
  description: string;
  is_new_board: boolean;
};

type Board = { id: string; name: string; cover_url?: string | null };
type LinkMetadata = {
  title: string;
  description: string;
  image: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'),
    new RegExp(`name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function isGenericShareTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (GENERIC_SHARE_TITLES.test(trimmed)) return true;
  return false;
}

function cleanPageTitle(raw: string): string {
  let title = raw.trim();

  // Instagram: "Account on Instagram: \"caption...\"" → use caption start or account event name
  const igMatch = title.match(/^(.+?) on Instagram:\s*"([^"]{0,120})/i);
  if (igMatch) {
    const caption = igMatch[2].trim();
    if (caption.length > 10) return caption.slice(0, 120);
    return igMatch[1].trim();
  }

  // YouTube: "Video Title | Channel" → video title
  const ytParts = title.split(/\s[|\-–—]\s/);
  if (ytParts.length > 1 && /youtube/i.test(raw)) {
    return ytParts[0].trim();
  }

  return title.slice(0, 120);
}

function summarizeDescription(text: string, maxLen = 400): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '…';
}

async function fetchOEmbed(url: string): Promise<Partial<LinkMetadata>> {
  const normalizedUrl = url.replace(/^https:\/\/youtube\.com/, 'https://www.youtube.com');
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`,
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      return {
        title: data.title ?? undefined,
        description: data.author_name ? `By ${data.author_name}` : undefined,
        image: data.thumbnail_url ?? null,
      };
    } catch {
      // try next
    }
  }
  return {};
}

async function fetchLinkMetadata(url: string, shareTitle: string): Promise<LinkMetadata> {
  const fallbackTitle = isGenericShareTitle(shareTitle) ? url : shareTitle;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text().slice(0, 200_000);
      const ogTitle = extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title');
      const ogDesc = extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ??
        extractMeta(html, 'twitter:description');
      const ogImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');

      const oembed = await fetchOEmbed(url);

      const rawTitle = oembed.title ?? ogTitle ?? fallbackTitle;
      const title = cleanPageTitle(rawTitle);
      const description = summarizeDescription(ogDesc ?? oembed.description ?? '');

      console.log('Metadata fetched', { url, title: title.slice(0, 80), descLen: description.length, hasImage: !!ogImage });

      return {
        title,
        description,
        image: oembed.image ?? ogImage ?? null,
      };
    }
  } catch (error) {
    console.error('Metadata fetch failed', error);
  }

  const oembed = await fetchOEmbed(url);
  return {
    title: cleanPageTitle(oembed.title ?? fallbackTitle),
    description: oembed.description ?? '',
    image: oembed.image ?? null,
  };
}

function isPlatformBoardName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (PLATFORM_NAMES.has(lower)) return true;
  if (/^(instagram|youtube|tiktok|twitter|facebook)\s+(post|posts|video|videos|link|links|share|reel|reels|content)$/i.test(lower)) {
    return true;
  }
  for (const platform of PLATFORM_NAMES) {
    if (lower === `${platform} posts` || lower === `${platform} videos` || lower.startsWith(`${platform} `)) {
      return true;
    }
  }
  return false;
}

function inferBoardFromContent(metadata: LinkMetadata): string {
  const text = `${metadata.title} ${metadata.description}`.toLowerCase();
  const topics: [RegExp, string][] = [
    [/\b(football|soccer|fifa|world cup|copa mundial|goal|match)\b/i, 'Football'],
    [/\b(techno|gabber|hardcore|dj|electronic|rave|festival|warehouse)\b/i, 'Techno'],
    [/\b(recipe|cooking|food|restaurant)\b/i, 'Recipes'],
    [/\b(design|ui|ux|figma)\b/i, 'Design'],
    [/\b(fitness|workout|gym)\b/i, 'Fitness'],
  ];
  for (const [pattern, board] of topics) {
    if (pattern.test(text)) return board;
  }
  const fromTitle = metadata.title.split(/[|\-–—:]/)[0]?.trim();
  if (fromTitle && fromTitle.length > 2 && fromTitle.length <= 32 && !isPlatformBoardName(fromTitle)) {
    return fromTitle.slice(0, 32);
  }
  return 'Saved';
}

function heuristicClassify(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  sourceApp: string,
): ClassifyResult {
  const haystack = `${metadata.title} ${metadata.description} ${url}`.toLowerCase();

  for (const board of boards) {
    if (isPlatformBoardName(board.name)) continue;
    const name = board.name.toLowerCase();
    if (name.length > 2 && haystack.includes(name)) {
      return {
        board_name: board.name,
        title: metadata.title,
        description: summarizeDescription(metadata.description || metadata.title, 160),
        is_new_board: false,
      };
    }
  }

  const boardName = inferBoardFromContent(metadata);
  const existing = boards.find((b) => b.name.toLowerCase() === boardName.toLowerCase());
  return {
    board_name: existing?.name ?? boardName,
    title: metadata.title,
    description: summarizeDescription(metadata.description || metadata.title, 160),
    is_new_board: !existing,
  };
}

function buildClassifyPrompt(
  url: string,
  metadata: LinkMetadata,
  sourceApp: string,
  boardList: string[],
): string {
  return `You are a content classifier for a personal bookmark manager. Your job is to organize a saved link into the user's boards by topic — like Pinterest boards, but automatic.

## INPUT

- URL: ${url}
- Page title: ${metadata.title}
- Page description: ${metadata.description || '(none)'}
- Shared from: ${sourceApp} (source app only — ignore this for topic classification)

## USER'S EXISTING BOARDS
${boardList.length ? boardList : '(none yet)'}

## YOUR TASK

Analyze the URL, title, and description to understand what this content is actually about. Then return a JSON object with these fields:

### board_name
The thematic topic this content belongs to (e.g. "Techno", "Football", "Graffiti", "Recipes", "Architecture").
- MUST reflect the content's subject matter — never the source platform
- NEVER use platform names: "Instagram", "YouTube", "TikTok", "Reddit", etc.
- NEVER use generic labels: "Videos", "Posts", "Links", "Saved Items"
- Prefer an existing board if the topic clearly fits — exact name match
- Only create a new board name if no existing board is a reasonable fit

### title
A short, specific title for this bookmark (max 40 characters).
- Use the actual subject: artist name, event, video title, dish name, etc.
- Do NOT use the raw URL
- Do NOT use generic phrases like "Instagram Share" or "YouTube Video"

### description
One specific sentence describing what this link is actually about.
- Reference real names, places, events, or topics from the metadata
- Do NOT write filler: "A post shared on Instagram" or "A YouTube video about a topic"
- If metadata is sparse, infer from the URL path and domain

### is_new_board
- true only if none of the existing boards fit this content's topic
- false if an existing board is a clear or reasonable match

## OUTPUT FORMAT

Respond with valid JSON only. No markdown, no explanation, no extra text.

{"board_name":"...","title":"...","description":"...","is_new_board":true|false}

## EXAMPLES

Input: Instagram post, title "DJ Promo @ Gabber Resistance", no existing boards
Output: {"board_name":"Techno","title":"DJ Promo at Gabber Resistance","description":"Gabber Resistance announces DJ Promo playing vinyl hardcore sets at their upcoming event.","is_new_board":true}

Input: YouTube video, title "Guga Foods — Dry Aged A5 Wagyu", existing boards: ["Recipes","Travel","Football"]
Output: {"board_name":"Recipes","title":"Guga Foods: Dry Aged A5 Wagyu","description":"Guga Foods tests dry-aging A5 Wagyu beef and compares it to fresh cuts.","is_new_board":false}`;
}

async function classifyWithGemini(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  sourceApp: string,
): Promise<ClassifyResult | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set — using fallback classification');
    return null;
  }

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  const boardList = boards.map((b) => b.name);
  const prompt = buildClassifyPrompt(url, metadata, sourceApp, boardList);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) {
    console.error('Gemini error', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as ClassifyResult;
    if (!parsed.board_name || !parsed.title || !parsed.description) return null;
    if (isPlatformBoardName(parsed.board_name)) return null;
    if (isGenericShareTitle(parsed.title)) parsed.title = metadata.title;
    parsed.title = parsed.title.slice(0, 40);

    return parsed;
  } catch {
    console.error('Failed to parse Gemini response', cleaned);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  let body: { url?: string; title?: string; source_app?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const url = body.url?.trim();
  if (!url) {
    return json({ success: false, error: 'URL is required' }, 400);
  }

  const shareTitle = body.title?.trim() || '';
  const sourceApp = body.source_app?.trim() || 'Web';

  const { data: existingBookmark } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('url', url)
    .maybeSingle();

  if (existingBookmark) {
    return json({ success: false, error: 'Link already saved' }, 409);
  }

  const metadata = await fetchLinkMetadata(url, shareTitle);

  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, cover_url')
    .eq('user_id', user.id);

  if (boardsError) {
    return json({ success: false, error: boardsError.message }, 500);
  }

  const boardList = boards ?? [];
  const classified =
    (await classifyWithGemini(boardList, metadata, url, sourceApp)) ??
    heuristicClassify(boardList, metadata, url, sourceApp);

  let boardId: string;
  let boardName: string;
  let isNewBoard = false;

  const existingBoard = boardList.find(
    (b) => b.name.toLowerCase() === classified.board_name.toLowerCase(),
  );

  if (existingBoard) {
    boardId = existingBoard.id;
    boardName = existingBoard.name;
    if (!existingBoard.cover_url && metadata.image) {
      await supabase.from('boards').update({ cover_url: metadata.image }).eq('id', boardId);
    }
  } else {
    isNewBoard = true;
    const { data: newBoard, error: createError } = await supabase
      .from('boards')
      .insert({
        user_id: user.id,
        name: classified.board_name,
        cover_url: metadata.image,
      })
      .select('id, name')
      .single();

    if (createError) {
      return json({ success: false, error: createError.message }, 500);
    }

    boardId = newBoard.id;
    boardName = newBoard.name;
  }

  const { error: insertError } = await supabase.from('bookmarks').insert({
    user_id: user.id,
    board_id: boardId,
    url,
    title: classified.title || metadata.title,
    description: classified.description,
    source_app: sourceApp,
    thumbnail_url: metadata.image,
  });

  if (insertError) {
    return json({ success: false, error: insertError.message }, 500);
  }

  return json({
    success: true,
    board_name: boardName,
    title: classified.title,
    description: classified.description,
    is_new_board: isNewBoard,
  });
});

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

const GENERIC_BOARD_NAMES = new Set([
  'other', 'others', 'misc', 'miscellaneous', 'general', 'uncategorized',
  'saved', 'saved items', 'links', 'stuff', 'random', 'various', 'unknown',
  'content', 'posts', 'videos', 'media', 'items', 'archive', 'inbox',
]);

/** Umbrella categories — always split into a specific sport, genre, or topic */
const BROAD_BOARD_NAMES = new Set([
  'music', 'sport', 'sports', 'food', 'cooking', 'entertainment', 'video', 'videos',
  'fitness', 'health', 'technology', 'tech', 'news', 'education', 'learning',
  'gaming', 'games', 'culture', 'lifestyle', 'fashion', 'travel', 'science',
  'business', 'finance', 'politics', 'comedy', 'film', 'movies', 'tv', 'television',
]);

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const GENERIC_SHARE_TITLES = /^(instagram share|shared from instagram|youtube|tiktok|shared link|web page)$/i;

const MAX_BOOKMARK_TITLE = 60;
const MAX_BOOKMARK_DESC = 500;

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

function cleanPageTitle(raw: string, url = ''): string {
  let title = raw.trim();

  // Platform chrome: "Account • Platform photo/video/post" — caption often in preview image
  const platformChrome = title.match(
    /^(.+?)\s*[•·\-–—]\s*(Instagram|TikTok|Pinterest|Twitter|Facebook|LinkedIn|Reddit)\s+(photo|video|reel|post|pin|tweet|image|story)/i,
  );
  if (platformChrome) {
    return platformChrome[1].trim().slice(0, 120);
  }

  // "Account on Platform: \"caption...\"" → caption if present, else account
  const onPlatformMatch = title.match(/^(.+?) on (Instagram|TikTok|Pinterest|Twitter|Facebook):\s*"([^"]{0,120})/i);
  if (onPlatformMatch) {
    const caption = onPlatformMatch[3].trim();
    if (caption.length > 10) return caption.slice(0, 120);
    return onPlatformMatch[1].trim();
  }

  // Instagram legacy pattern
  const igMatch = title.match(/^(.+?) on Instagram:\s*"([^"]{0,120})/i);
  if (igMatch) {
    const caption = igMatch[2].trim();
    if (caption.length > 10) return caption.slice(0, 120);
    return igMatch[1].trim();
  }

  // YouTube: "Video Title | Channel" → keep video title only (split on pipe, not dashes — scores use "1 – 3")
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const pipeIdx = title.indexOf(' | ');
    if (pipeIdx > 0) title = title.slice(0, pipeIdx).trim();
  }

  return title.slice(0, 120);
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtube.com' || parsed.hostname === 'm.youtube.com') {
      parsed.hostname = 'www.youtube.com';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [/[?&]v=([^&]+)/, /youtu\.be\/([^?&]+)/, /embed\/([^?&]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractYouTubePlayerData(html: string): { title?: string; description?: string } {
  const marker = 'var ytInitialPlayerResponse = ';
  const start = html.indexOf(marker);
  if (start === -1) return {};

  let i = start + marker.length;
  if (html[i] !== '{') return {};

  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') {
      depth--;
      if (depth === 0) {
        try {
          const data = JSON.parse(html.slice(i, j + 1));
          return {
            title: data?.videoDetails?.title,
            description: data?.videoDetails?.shortDescription,
          };
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}

function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function summarizeDescription(text: string, maxLen = 400): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '…';
}

/** Strip social engagement noise from scraped descriptions (likes, comments, views) */
function cleanMetadataDescription(desc: string): string {
  if (!desc) return '';
  let d = desc;
  d = d.replace(/[^.!?\n]*\b\d[\d,.\s]*\s*(likes?|comments?|views?|shares?|followers?|subscribers?|reposts?)[^.!?\n]*[.!?\n]?/gi, ' ');
  d = d.replace(/[^.!?\n]*\b(received|has|have|got)\s+\d[\d,.\s]*\s*(likes?|comments?|views?)[^.!?\n]*[.!?\n]?/gi, ' ');
  d = d.replace(/\b\d[\d,.\s]*\s*(likes?|comments?|views?)\s*(and|&|,|y|e)\s*\d[\d,.\s]*\s*(likes?|comments?|views?)\b/gi, '');
  return d.replace(/\s+/g, ' ').trim();
}

function sanitizeMetadata(metadata: LinkMetadata): LinkMetadata {
  return {
    title: metadata.title.trim(),
    description: cleanMetadataDescription(metadata.description),
    image: metadata.image,
  };
}

function sanitizeBookmarkDescription(desc: string): string {
  return summarizeDescription(cleanMetadataDescription(desc), MAX_BOOKMARK_DESC);
}

function cleanYouTubeUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

async function fetchMicrolink(url: string): Promise<Partial<LinkMetadata>> {
  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    if (data.status !== 'success' || !data.data) return {};
    return {
      title: data.data.title ?? undefined,
      description: data.data.description ?? undefined,
      image: data.data.image?.url ?? data.data.logo?.url ?? null,
    };
  } catch {
    return {};
  }
}

async function fetchNoembed(url: string): Promise<Partial<LinkMetadata>> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    if (data.error) return {};
    return {
      title: data.title ?? undefined,
      description: data.author_name ? `By ${data.author_name}` : undefined,
      image: data.thumbnail_url ?? null,
    };
  } catch {
    return {};
  }
}

async function fetchOEmbed(url: string): Promise<Partial<LinkMetadata>> {
  const youtubeUrl = cleanYouTubeUrl(url) ?? url.replace(/^https:\/\/youtube\.com/, 'https://www.youtube.com');
  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(youtubeUrl)}`,
    `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
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

type ExternalMetadata = Partial<LinkMetadata> & { source?: string };

async function fetchExternalMetadata(url: string): Promise<ExternalMetadata> {
  const noembed = await fetchNoembed(url);
  if (noembed.title) return { ...noembed, source: 'noembed' };

  const microlink = await fetchMicrolink(url);
  if (microlink.title) return { ...microlink, source: 'microlink' };

  const oembed = await fetchOEmbed(url);
  if (oembed.title) return { ...oembed, source: 'oembed' };

  return {};
}

async function fetchLinkMetadata(url: string, shareTitle: string): Promise<LinkMetadata> {
  const normalizedUrl = normalizeUrl(url);
  const youtubeClean = cleanYouTubeUrl(normalizedUrl);
  const fetchUrl = youtubeClean ?? normalizedUrl;
  const fallbackTitle = isGenericShareTitle(shareTitle) ? fetchUrl : shareTitle;
  const youtubeId = extractYouTubeVideoId(fetchUrl);
  const youtubeThumb = youtubeId ? youtubeThumbnail(youtubeId) : null;

  const external = await fetchExternalMetadata(fetchUrl);

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = (await res.text()).slice(0, 400_000);
      const playerData = youtubeId ? extractYouTubePlayerData(html) : {};
      const ogTitle = extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title');
      const ogDesc = extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ??
        extractMeta(html, 'twitter:description');
      const ogImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');

      const oembed = external.title ? external : await fetchOEmbed(fetchUrl);

      const rawTitle = external.title ?? playerData.title ?? oembed.title ?? ogTitle ?? fallbackTitle;
      const title = cleanPageTitle(rawTitle, fetchUrl);
      const description = summarizeDescription(
        playerData.description ?? external.description ?? ogDesc ?? oembed.description ?? '',
      );

      const source = external.source ?? (playerData.title ? 'player' : ogTitle ? 'og' : 'fallback');

      console.log('Metadata fetched', {
        url: fetchUrl,
        title: title.slice(0, 80),
        descLen: description.length,
        hasImage: !!(external.image ?? oembed.image ?? ogImage ?? youtubeThumb),
        source,
      });

      return sanitizeMetadata({
        title,
        description,
        image: external.image ?? oembed.image ?? ogImage ?? youtubeThumb,
      });
    }
  } catch (error) {
    console.error('Metadata fetch failed', error);
  }

  if (external.title) {
    return sanitizeMetadata({
      title: cleanPageTitle(external.title, fetchUrl),
      description: summarizeDescription(external.description ?? ''),
      image: external.image ?? youtubeThumb,
    });
  }

  const oembed = await fetchOEmbed(fetchUrl);
  return sanitizeMetadata({
    title: cleanPageTitle(oembed.title ?? fallbackTitle, fetchUrl),
    description: oembed.description ?? '',
    image: oembed.image ?? youtubeThumb,
  });
}

function isGenericBoardName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (GENERIC_BOARD_NAMES.has(lower)) return true;
  if (/^(other|misc|general|saved|links?|posts?|videos?)\b/i.test(lower)) return true;
  return false;
}

function isBroadBoardName(name: string): boolean {
  return BROAD_BOARD_NAMES.has(name.trim().toLowerCase());
}

/** Pick the most specific board from metadata — sports, music genres, topics */
function inferGranularBoard(metadata: LinkMetadata, url: string): string {
  const text = `${metadata.title} ${metadata.description} ${url}`;

  const rules: [RegExp, string][] = [
    // Sports (specific discipline, never "Sports")
    [/\b(formula\s*1|\bf1\b|grand prix|motogp|motorsport)\b/i, 'Formula 1'],
    [/\b(mma|ufc|bellator|mixed martial arts)\b/i, 'MMA'],
    [/\b(boxing|heavyweight|lightweight|ko\b|knockout)\b/i, 'Boxing'],
    [/\b(tennis|wimbledon|roland\s*garros|us\s*open|australian\s*open|atp|wta)\b/i, 'Tennis'],
    [/\b(basketball|nba|wnba|euroleague|dunk)\b/i, 'Basketball'],
    [/\b(football|soccer|fifa|premier\s*league|la\s*liga|champions\s*league|copa\s*mundial|world\s*cup)\b/i, 'Football'],
    [/\b(rugby|six\s*nations)\b/i, 'Rugby'],
    [/\b(cricket|ipl|ashes)\b/i, 'Cricket'],
    [/\b(golf|pga|masters)\b/i, 'Golf'],
    [/\b(cycling|tour\s*de\s*france|giro)\b/i, 'Cycling'],
    [/\b(volleyball|beach\s*volley)\b/i, 'Volleyball'],
    [/\b(baseball|mlb)\b/i, 'Baseball'],
    [/\b(hockey|nhl|ice\s*hockey)\b/i, 'Hockey'],
    [/\b(swimming|olympics?\s*swim)\b/i, 'Swimming'],
    [/\b(ski|snowboard|winter\s*olympics)\b/i, 'Winter Sports'],
    // Music genres (specific, never "Music")
    [/\b(gabber|hardcore|hard\s*techno|industrial|schranz)\b/i, 'Techno'],
    [/\b(techno|warehouse|rave|berghain)\b/i, 'Techno'],
    [/\b(house|deep\s*house|tech\s*house|afro\s*house)\b/i, 'House'],
    [/\b(hip[\s-]?hop|rap|freestyle|cypher|beatbox|drill|trap|grime|boom\s*bap|rimas|mc\b|bars)\b/i, 'Hip-Hop'],
    [/\b(jazz|bebop|swing|blues)\b/i, 'Jazz'],
    [/\b(classical|orchestra|symphony|opera)\b/i, 'Classical'],
    [/\b(rock|metal|punk|grunge|indie\s*rock)\b/i, 'Rock'],
    [/\b(r&b|rnb|soul|neo[\s-]?soul)\b/i, 'R&B'],
    [/\b(pop|k[\s-]?pop|j[\s-]?pop)\b/i, 'Pop'],
    [/\b(country|folk|acoustic)\b/i, 'Folk'],
    [/\b(reggaeton|latin|salsa|bachata)\b/i, 'Latin'],
    [/\b(electronic|edm|trance|dubstep|dnb|drum\s*and\s*bass)\b/i, 'Electronic'],
    [/\b(dj\s|live\s*set|festival|boiler\s*room)\b/i, 'Electronic'],
    // Other topics
    [/\b(inspir|motivat|mindset|quote|cita|energ[ií]a|energy|frase|wisdom)\b/i, 'Inspiration'],
    [/\b(painting|sculpture|gallery|museum|illustration|canvas)\b/i, 'Art'],
    [/\b(fine art|street art|graffiti)\b/i, 'Art'],
    [/\b(idea|ideas|thought|reflexi[oó]n|philosophy)\b/i, 'Ideas'],
    [/\b(recipe|cooking|food|restaurant|baking|meal\s*prep)\b/i, 'Recipes'],
    [/\b(design|ui|ux|figma|typography|branding)\b/i, 'Design'],
    [/\b(workout|gym|training|crossfit|yoga|pilates)\b/i, 'Fitness'],
    [/\b(startup|entrepreneur|saas|marketing)\b/i, 'Business'],
    [/\b(programming|coding|developer|software|javascript|python|react)\b/i, 'Programming'],
  ];

  for (const [pattern, board] of rules) {
    if (pattern.test(text)) return board;
  }

  if (isLikelyFootball(metadata.title, metadata.description)) return 'Football';

  return 'Inspiration';
}

function refineBoardName(name: string, metadata: LinkMetadata, url: string, existingBoards: string[]): string {
  let refined = name;
  if (isBroadBoardName(refined) || isGenericBoardName(refined)) {
    const inferred = inferGranularBoard(metadata, url);
    const match = existingBoards.find((b) => b.toLowerCase() === inferred.toLowerCase());
    refined = match ?? inferred;
  }
  return validateBoardChoice(refined, metadata, url, existingBoards);
}

const MUSIC_BOARDS = new Set([
  'hip-hop', 'techno', 'jazz', 'house', 'electronic', 'rock', 'pop', 'r&b', 'classical', 'folk', 'latin',
]);

const MUSIC_PERFORMANCE =
  /\b(freestyle|hip[\s-]?hop|\brap\b|cypher|beatbox|\bmc\b|\bbars\b|spitting|flow\b|rimas|freestyle rap|batalla)\b/i;

/** Correct common mislabels (e.g. rap reel classified as Art) */
function validateBoardChoice(
  board: string,
  metadata: LinkMetadata,
  url: string,
  existingBoards: string[],
): string {
  const text = `${metadata.title} ${metadata.description}`;
  const inferred = inferGranularBoard(metadata, url);
  const boardLower = board.toLowerCase();

  if (boardLower === 'art' && (MUSIC_PERFORMANCE.test(text) || MUSIC_BOARDS.has(inferred.toLowerCase()))) {
    const preferred = existingBoards.find((b) => b.toLowerCase() === inferred.toLowerCase()) ??
      existingBoards.find((b) => b.toLowerCase() === 'hip-hop');
    return preferred ?? (MUSIC_PERFORMANCE.test(text) ? 'Hip-Hop' : inferred);
  }

  return board;
}

function isPlatformChromeTitle(title: string): boolean {
  if (/[•·]\s*(instagram|tiktok|pinterest|twitter|facebook|linkedin|reddit)\s+(photo|video|reel|post|pin|tweet|image|story)/i.test(title)) {
    return true;
  }
  if (/\bon\s+(instagram|tiktok|pinterest|twitter|facebook|linkedin|reddit)\b/i.test(title)) return true;
  if (/^(video|photo|image|post|reel|pin|tweet|shared link|web page)$/i.test(title.trim())) return true;
  return false;
}

function isSparseMetadata(metadata: LinkMetadata, _url: string): boolean {
  const title = metadata.title.trim();
  const desc = metadata.description.trim();
  const combined = `${title} ${desc}`.trim();

  if (isGenericShareTitle(title)) return true;
  if (isPlatformChromeTitle(title)) return true;

  // Author-only metadata: "By Creator Name" with no real description
  if (desc.length < 50 && /^by\s+[\w\s.@]+$/i.test(desc)) return true;

  // Handle-only title (@creator) — caption carries the real topic
  if (/^@[\w.]+$/.test(title.trim())) return true;

  // Handle/account-only title with little context
  if (/^@?\w[\w.]+\s*\(@[\w.]+\)\s*$/.test(title) && desc.length < 50) return true;

  // Very little combined text but we have a preview image — topic likely in the image
  if (metadata.image && combined.length < 90) return true;
  if (desc.length < 25 && title.length < 40) return true;

  return false;
}

function isBadBoardName(name: string): boolean {
  if (isPlatformBoardName(name)) return true;
  if (isGenericBoardName(name)) return true;
  // Truncated scoreline used as board: "Portugal 1", "Uzbekistán 1"
  if (/^.+\s\d{1,2}$/.test(name.trim()) && name.length < 24) return true;
  return false;
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

type FootballScoreline = {
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  extra?: string;
};

function parseFootballScoreline(title: string): FootballScoreline | null {
  const pipeParts = title.split(/\s*[|•]\s*/);
  const main = pipeParts[0]?.trim() ?? title;
  const extra = pipeParts.slice(1).join(' • ').trim() || undefined;

  const scoreMatch = main.match(/^(.+?)\s+(\d{1,2})\s*[–\-—]\s*(\d{1,2})\s+(.+)$/);
  if (!scoreMatch) return null;

  return {
    home: scoreMatch[1].trim(),
    homeScore: scoreMatch[2],
    awayScore: scoreMatch[3],
    away: scoreMatch[4].trim(),
    extra,
  };
}

function footballDisplayTitle(scoreline: FootballScoreline): string {
  return `Match highlights ${scoreline.home} vs ${scoreline.away}`;
}

function footballDescription(scoreline: FootballScoreline, metadata: LinkMetadata): string {
  const parts = [
    `${scoreline.home} ${scoreline.homeScore}–${scoreline.awayScore} ${scoreline.away}`,
    scoreline.extra,
    metadata.description.trim(),
  ].filter(Boolean);
  return parts.join('. ') + (parts.length ? '.' : '');
}

function buildTitleFromMetadata(metadata: LinkMetadata, url: string, boardName?: string): string {
  const raw = youtubeVideoTitle(metadata.title);
  const board = boardName?.toLowerCase() ?? '';

  if (/^@[\w.]+$/.test(raw)) {
    if (board === 'hip-hop') return `Freestyle: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
    return raw.slice(0, MAX_BOOKMARK_TITLE);
  }

  const scoreline = parseFootballScoreline(raw);
  if (scoreline || board === 'football' || isLikelyFootball(metadata.title, metadata.description)) {
    if (scoreline) return footballDisplayTitle(scoreline).slice(0, MAX_BOOKMARK_TITLE);
    const vsMatch = raw.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)$/i);
    if (vsMatch) {
      return `Match highlights ${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`.slice(0, MAX_BOOKMARK_TITLE);
    }
  }

  if (board === 'recipes' || /\b(recipe|cooking|how to make|baking)\b/i.test(raw)) {
    const dish = raw.replace(/^(recipe|how to make|cooking)\s*[:\-–—]?\s*/i, '').trim() || raw;
    return `Recipe: ${dish}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'techno' || board === 'house' || board === 'electronic' || /\b(gabber|techno|hardcore|dj|rave|festival)\b/i.test(raw)) {
    if (/\b(live|set|promo|festival|warehouse|@)\b/i.test(raw)) {
      return `Live set: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
    }
    return `Track: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'hip-hop' || board === 'jazz' || board === 'rock' || board === 'pop' || board === 'r&b' || board === 'classical' || board === 'folk' || board === 'latin') {
    if (/\b(freestyle|cypher|live|concert|performance|session)\b/i.test(raw)) {
      return `Freestyle: ${raw.replace(/^@/, '')}`.slice(0, MAX_BOOKMARK_TITLE);
    }
    if (/\b(live|concert|performance|session)\b/i.test(raw)) {
      return `Live: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
    }
    return `Track: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'basketball' || board === 'tennis' || board === 'hockey' || board === 'baseball') {
    const vsMatch = raw.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)(?:\s*[|•]|$)/i);
    if (vsMatch) {
      return `Game highlights ${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`.slice(0, MAX_BOOKMARK_TITLE);
    }
  }

  if (/\b(tutorial|how to|guide|explained|course|lesson)\b/i.test(raw)) {
    return `Tutorial: ${raw.replace(/^(how to|tutorial)\s*[:\-–—]?\s*/i, '').trim() || raw}`.slice(
      0,
      MAX_BOOKMARK_TITLE,
    );
  }

  if (/\b(review|unboxing|hands-on|first look)\b/i.test(raw)) {
    return `Review: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'inspiration' || board === 'motivation' || board === 'art' || board === 'ideas') {
    return raw.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (/youtube\.com|youtu\.be/i.test(url) && raw.length > 5) {
    return `Video: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  return raw.slice(0, MAX_BOOKMARK_TITLE);
}

function youtubeVideoTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ');
  return (pipeIdx > 0 ? title.slice(0, pipeIdx) : title).trim();
}

function isLikelyFootball(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  if (/\d+\s*[–\-—]\s*\d+/.test(title)) return true;
  return /\b(football|soccer|fifa|world cup|copa mundial|resumen|highlights|vs\.?| v )\b/i.test(text);
}

function buildDescriptionFromMetadata(metadata: LinkMetadata, url: string, boardName?: string): string {
  const raw = youtubeVideoTitle(metadata.title);
  const scoreline = parseFootballScoreline(raw);

  if (scoreline || boardName?.toLowerCase() === 'football' || isLikelyFootball(metadata.title, metadata.description)) {
    if (scoreline) {
      return summarizeDescription(footballDescription(scoreline, metadata), MAX_BOOKMARK_DESC);
    }
  }

  const desc = metadata.description.trim();
  if (desc.length > 20 && !/^by /i.test(desc)) {
    const context = raw && !desc.toLowerCase().includes(raw.toLowerCase().slice(0, 20))
      ? ` Original title: ${raw}.`
      : '';
    return summarizeDescription(desc + context, MAX_BOOKMARK_DESC);
  }

  const parts: string[] = [];
  if (desc) parts.push(desc);
  if (raw) parts.push(`Original title: ${raw}`);
  if (parts.length === 0) parts.push(`Saved from ${url}`);

  return summarizeDescription(parts.join('. ') + '.', MAX_BOOKMARK_DESC);
}

function polishClassifyResult(
  result: ClassifyResult,
  metadata: LinkMetadata,
  url: string,
  existingBoards: string[] = [],
): ClassifyResult {
  result.board_name = refineBoardName(result.board_name, metadata, url, existingBoards);

  const rawMetaTitle = youtubeVideoTitle(metadata.title);
  const scoreline = parseFootballScoreline(rawMetaTitle) ?? parseFootballScoreline(result.title);

  const isFootball =
    result.board_name.toLowerCase() === 'football' ||
    isLikelyFootball(metadata.title, metadata.description);

  if (isFootball && scoreline) {
    result.title = footballDisplayTitle(scoreline);
    const scoreDetail = footballDescription(scoreline, metadata);
    if (!result.description.includes(scoreline.homeScore)) {
      result.description = `${scoreDetail} ${result.description}`.trim();
    }
  } else if (/\d+\s*[–\-—]\s*\d+/.test(result.title) && scoreline) {
    result.title = footballDisplayTitle(scoreline);
  }

  // Title looks like raw page title copy-paste — rebuild from metadata when possible
  if (
    result.title.toLowerCase() === rawMetaTitle.toLowerCase().slice(0, result.title.length) &&
    rawMetaTitle.length > result.title.length - 5
  ) {
    result.title = buildTitleFromMetadata(metadata, url, result.board_name);
  }

  result.title = result.title.slice(0, MAX_BOOKMARK_TITLE);
  result.description = sanitizeBookmarkDescription(result.description);
  return result;
}

function inferBoardFromContent(metadata: LinkMetadata, url: string): string {
  return inferGranularBoard(metadata, url);
}

function resolveGenericBoard(
  boards: Board[],
  _metadata: LinkMetadata,
  _url: string,
): { board_name: string; is_new_board: boolean } {
  const preferred = ['Inspiration', 'Motivation', 'Art', 'Ideas'];
  for (const name of preferred) {
    const existing = boards.find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (existing) return { board_name: existing.name, is_new_board: false };
  }
  return { board_name: 'Inspiration', is_new_board: true };
}

function heuristicClassify(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  _sourceApp: string,
): ClassifyResult {
  const haystack = `${metadata.title} ${metadata.description} ${url}`.toLowerCase();

  for (const board of boards) {
    if (isPlatformBoardName(board.name)) continue;
    const name = board.name.toLowerCase();
    if (name.length > 2 && haystack.includes(name)) {
      return {
        board_name: board.name,
        title: buildTitleFromMetadata(metadata, url, board.name),
        description: buildDescriptionFromMetadata(metadata, url, board.name),
        is_new_board: false,
      };
    }
  }

  const boardName = inferBoardFromContent(metadata, url);
  const safeBoardName = isBadBoardName(boardName) ? 'Inspiration' : boardName;
  const existing = boards.find((b) => b.name.toLowerCase() === safeBoardName.toLowerCase());
  const boardLabel = existing?.name ?? safeBoardName;
  return polishClassifyResult(
    {
      board_name: boardLabel,
      title: buildTitleFromMetadata(metadata, url, boardLabel),
      description: buildDescriptionFromMetadata(metadata, url, boardLabel),
      is_new_board: !existing,
    },
    metadata,
    url,
    boards.map((b) => b.name),
  );
}

function buildBoardPrompt(
  url: string,
  metadata: LinkMetadata,
  boardList: string[],
): string {
  return `Pick the single best board for this saved link.

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}

Existing boards: ${boardList.length ? boardList.join(', ') : '(none yet)'}

Rules:
- Specific topic: Football, Hip-Hop, Techno, Jazz, Recipes — never Sports, Music, Other, Miscellaneous
- Freestyle / rap / cypher / beatbox / hip-hop performance → Hip-Hop (NOT Art)
- Art = paintings, illustrations, gallery work — NOT music or dance performances
- Prefer an existing board when it clearly fits

JSON only: {"board_name":"...","is_new_board":true|false}`;
}

function buildCopyPrompt(
  url: string,
  metadata: LinkMetadata,
  boardName: string,
): string {
  return `Write a bookmark title and description. Board: ${boardName}

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}

Title (max ${MAX_BOOKMARK_TITLE}): short label as [type] + [subject]
- e.g. "Freestyle: @nite.huertas", "Match highlights X vs Y", "Recipe: garlic pasta"
- NOT a raw page title copy-paste

Description (max ${MAX_BOOKMARK_DESC}): 1–2 sentences about what this link is
- Include creator, topic, context, scores/events when relevant
- NEVER mention: likes, comments, views, followers, shares, engagement, "the post received"

JSON only: {"title":"...","description":"..."}`;
}

function buildBoardVisionPrompt(
  url: string,
  metadata: LinkMetadata,
  boardList: string[],
): string {
  return `Pick the best board for this link using the image and metadata.

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}
Existing boards: ${boardList.length ? boardList.join(', ') : '(none yet)'}

Rules:
- Freestyle / rap / hip-hop performance → Hip-Hop (NOT Art)
- Specific sport or music genre — never Sports, Music, Other
JSON only: {"board_name":"...","is_new_board":true|false}`;
}

function parseJsonFromGemini<T>(text: string): T | null {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function resolveIsNewBoard(boardName: string, boards: Board[], geminiSaysNew: boolean): boolean {
  const exists = boards.some((b) => b.name.toLowerCase() === boardName.toLowerCase());
  if (exists) return false;
  return geminiSaysNew;
}

async function fetchImageBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim();
    if (contentType && !contentType.startsWith('image/')) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 4_000_000) return null;

    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

    return {
      mimeType: contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg',
      data: btoa(binary),
    };
  } catch (error) {
    console.error('Image fetch failed', error);
    return null;
  }
}

async function callGeminiGenerate(parts: GeminiPart[], apiKey: string): Promise<string | null> {
  if (Deno.env.get('SKIP_GEMINI') === 'true') return null;

  const preferred = Deno.env.get('GEMINI_MODEL');
  const models = preferred
    ? [preferred, 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
    : ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

  let errors503 = 0;
  const MAX_503 = 5;
  const RETRIES_PER_MODEL = 2; // 1 initial + 2 retries per model

  for (const model of [...new Set(models)]) {
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
      if (errors503 >= MAX_503) {
        console.error(`Gemini: ${MAX_503}×503 — using fallback`);
        return null;
      }

      if (attempt > 0) {
        const delayMs = 500 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.2 },
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }

      const errorBody = await response.text();
      const quotaZero = /limit:\s*0|RESOURCE_EXHAUSTED/i.test(errorBody);
      console.error(
        `Gemini error (${model}, attempt ${attempt + 1}/${RETRIES_PER_MODEL + 1})`,
        response.status,
        quotaZero ? 'no quota on this key/project (limit: 0)' : errorBody.slice(0, 200),
      );

      // limit: 0 = key/project has NO free tier — retrying other models won't help
      if (response.status === 429 && quotaZero) {
        console.error(
          'Gemini unavailable: check billing at https://aistudio.google.com/apikey. Using metadata fallback.',
        );
        return null;
      }

      if (response.status === 503) {
        errors503++;
        console.error(`Gemini 503 (${errors503}/${MAX_503}) on ${model}, attempt ${attempt + 1}`);
        if (errors503 >= MAX_503) {
          console.error(`Gemini: ${MAX_503}×503 — using fallback`);
          return null;
        }
        continue;
      }

      // Non-503 error — try next model
      break;
    }
  }

  return null;
}

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  return callGeminiGenerate([{ text: prompt }], apiKey);
}

async function pickBoardWithGemini(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
): Promise<{ board_name: string; is_new_board: boolean } | null> {
  const boardList = boards.map((b) => b.name);
  const text = await callGemini(buildBoardPrompt(url, metadata, boardList), apiKey);
  const parsed = parseJsonFromGemini<{ board_name: string; is_new_board: boolean }>(text ?? '');
  if (!parsed?.board_name) return null;
  if (isPlatformBoardName(parsed.board_name) || isBadBoardName(parsed.board_name)) return null;

  const board_name = validateBoardChoice(
    refineBoardName(parsed.board_name, metadata, url, boardList),
    metadata,
    url,
    boardList,
  );
  return {
    board_name,
    is_new_board: resolveIsNewBoard(board_name, boards, parsed.is_new_board ?? true),
  };
}

async function pickBoardWithGeminiVision(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
): Promise<{ board_name: string; is_new_board: boolean } | null> {
  if (!metadata.image) return null;

  const imageData = await fetchImageBase64(metadata.image);
  if (!imageData) return null;

  const boardList = boards.map((b) => b.name);
  const text = await callGeminiGenerate(
    [
      { text: buildBoardVisionPrompt(url, metadata, boardList) },
      { inline_data: { mime_type: imageData.mimeType, data: imageData.data } },
    ],
    apiKey,
  );
  const parsed = parseJsonFromGemini<{ board_name: string; is_new_board: boolean }>(text ?? '');
  if (!parsed?.board_name) return null;
  if (isPlatformBoardName(parsed.board_name) || isBadBoardName(parsed.board_name)) return null;

  console.log('Board picked with Gemini vision');
  const board_name = validateBoardChoice(
    refineBoardName(parsed.board_name, metadata, url, boardList),
    metadata,
    url,
    boardList,
  );
  return {
    board_name,
    is_new_board: resolveIsNewBoard(board_name, boards, parsed.is_new_board ?? true),
  };
}

async function writeCopyWithGemini(
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  apiKey: string,
): Promise<{ title: string; description: string } | null> {
  const text = await callGemini(buildCopyPrompt(url, metadata, boardName), apiKey);
  const parsed = parseJsonFromGemini<{ title: string; description: string }>(text ?? '');
  if (!parsed?.title || !parsed.description) return null;

  const title = isGenericShareTitle(parsed.title)
    ? buildTitleFromMetadata(metadata, url, boardName)
    : parsed.title.slice(0, MAX_BOOKMARK_TITLE);

  return {
    title,
    description: sanitizeBookmarkDescription(parsed.description),
  };
}

async function classifyLink(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  sourceApp: string,
): Promise<ClassifyResult> {
  const fallback = heuristicClassify(boards, metadata, url, sourceApp);

  // Try Gemini first when API key is set (unless explicitly disabled)
  if (Deno.env.get('SKIP_GEMINI') !== 'true') {
    const gemini = await classifyWithGemini(boards, metadata, url, sourceApp);
    if (gemini) {
      return gemini;
    }
    console.log('Gemini unavailable — using metadata fallback');
  }

  return fallback;
}

async function classifyWithGemini(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  _sourceApp: string,
): Promise<ClassifyResult | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set — using fallback classification');
    return null;
  }

  const boardList = boards.map((b) => b.name);

  // Step 1: pick board (text, then vision if needed)
  let boardPick = await pickBoardWithGemini(boards, metadata, url, apiKey);

  const needsVision = metadata.image && (
    !boardPick || isGenericBoardName(boardPick.board_name)
  );

  if (needsVision) {
    const visionPick = await pickBoardWithGeminiVision(boards, metadata, url, apiKey);
    if (visionPick) boardPick = visionPick;
  }

  if (!boardPick) return null;

  if (isGenericBoardName(boardPick.board_name)) {
    const resolved = resolveGenericBoard(boards, metadata, url);
    boardPick = { board_name: resolved.board_name, is_new_board: resolved.is_new_board };
  }

  // Step 2: title + description (separate focused prompt)
  let copy = await writeCopyWithGemini(metadata, url, boardPick.board_name, apiKey);
  if (!copy) {
    copy = {
      title: buildTitleFromMetadata(metadata, url, boardPick.board_name),
      description: buildDescriptionFromMetadata(metadata, url, boardPick.board_name),
    };
  }

  console.log('Classified with Gemini (2-step)', { board: boardPick.board_name });

  return polishClassifyResult(
    {
      board_name: boardPick.board_name,
      title: copy.title,
      description: copy.description,
      is_new_board: boardPick.is_new_board,
    },
    metadata,
    url,
    boardList,
  );
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
  const classified = await classifyLink(boardList, metadata, url, sourceApp);

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

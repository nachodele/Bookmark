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

/** Hosts where links are usually shared content (video/post/pin), not e-commerce */
const SOCIAL_CONTENT_HOST =
  /(?:^|\.)instagram\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.(?:com|[\w.]+)|twitter\.com|x\.com|facebook\.com|linkedin\.com|reddit\.com|snapchat\.com|vimeo\.com|threads\.net|bsky\.app/i;

const PLATFORM_NAME_ALT = [...PLATFORM_NAMES].filter((n) => n !== 'web').join('|');
const PLATFORM_CONTENT_TYPES = 'photo|video|reel|post|pin|tweet|image|story|short|clip|live';

function isSocialContentUrl(url: string): boolean {
  try {
    return SOCIAL_CONTENT_HOST.test(new URL(url).hostname);
  } catch {
    return SOCIAL_CONTENT_HOST.test(url);
  }
}

function isCommerceUrl(url: string): boolean {
  return /amazon\.|ebay\.|etsy\.|shopify\.com|\/products?\//i.test(url);
}

const GENERIC_BOARD_NAMES = new Set([
  'other', 'others', 'misc', 'miscellaneous', 'general', 'uncategorized',
  'saved', 'saved items', 'links', 'stuff', 'random', 'various', 'unknown',
  'content', 'posts', 'videos', 'media', 'items', 'archive', 'inbox',
  'vídeo', 'video',
]);

/** Format-only boards — never classify from URL/description boilerplate */
const GENERIC_MEDIA_BOARD_NAMES = new Set([
  'vídeo', 'video', 'entretenimiento', 'entertainment',
]);

/** Umbrella categories — always split into a specific sport, genre, or topic */
const BROAD_BOARD_NAMES = new Set([
  'music', 'sport', 'sports', 'food', 'cooking', 'entertainment', 'video', 'videos',
  'fitness', 'health', 'technology', 'tech', 'news', 'education', 'learning',
  'gaming', 'games', 'culture', 'lifestyle', 'travel', 'science',
  'business', 'finance', 'politics', 'comedy', 'film', 'movies', 'tv', 'television',
]);

type SupabaseClient = ReturnType<typeof createClient>;

type BoardCatalog = {
  names: string[];
  groupsText: string;
};

/** Fallback if board_catalog table is empty or unreachable */
const FALLBACK_CATALOG: BoardCatalog = {
  names: [
    'Football', 'Basketball', 'Tennis', 'Hip-Hop', 'Techno', 'Jazz', 'Fashion', 'Shopping', 'Home',
    'Recipes', 'Design', 'Programming', 'Art', 'Inspiration', 'Ideas', 'Film', 'Gaming',
  ],
  groupsText:
    'Sports: Football, Basketball, Tennis\nMusic: Hip-Hop, Techno, Jazz\nLifestyle: Fashion, Shopping, Home\nContent: Recipes, Design, Programming, Art, Inspiration, Ideas, Film, Gaming',
};

const CATALOG_CACHE_MS = 5 * 60 * 1000;
let catalogCache: { catalog: BoardCatalog; fetchedAt: number } | null = null;

function buildGroupsText(rows: { name: string; group_name: string }[]): string {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.name) continue;
    const list = grouped.get(row.group_name) ?? [];
    list.push(row.name);
    grouped.set(row.group_name, list);
  }
  return [...grouped.entries()].map(([group, names]) => `${group}: ${names.join(', ')}`).join('\n');
}

async function fetchBoardCatalog(supabase: SupabaseClient): Promise<BoardCatalog> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_CACHE_MS) {
    return catalogCache.catalog;
  }

  const { data, error } = await supabase
    .from('board_catalog')
    .select('name, group_name')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('board_catalog fetch failed — using fallback', error.message);
    return { ...FALLBACK_CATALOG, names: [...FALLBACK_CATALOG.names] };
  }

  const rows = (data ?? []).filter((row) => row.name);
  if (rows.length === 0) {
    console.error('board_catalog empty — using fallback');
    return { ...FALLBACK_CATALOG, names: [...FALLBACK_CATALOG.names] };
  }

  const catalog: BoardCatalog = {
    names: rows.map((row) => row.name),
    groupsText: buildGroupsText(rows),
  };
  catalogCache = { catalog, fetchedAt: Date.now() };
  return catalog;
}

function findInCatalog(name: string, catalog: BoardCatalog): string | undefined {
  return catalog.names.find((c) => c.toLowerCase() === name.trim().toLowerCase());
}

function formatAllowedBoardsPrompt(catalog: BoardCatalog, userBoards: string[]): string {
  const preferred = userBoards.filter((board) => {
    if (isPlatformBoardName(board) || isGenericBoardName(board)) return false;
    return true;
  });

  const preferredBlock = preferred.length > 0
    ? `USER BOARDS (highest priority — if the link fits one, pick that exact name):\n${preferred.join(', ')}\n\n`
    : '';

  const extra = preferred.filter(
    (board) => !catalog.names.some((name) => name.toLowerCase() === board.toLowerCase()),
  );
  const catalogBlock = extra.length > 0
    ? `${catalog.groupsText}\n(Also allowed: ${extra.join(', ')})`
    : catalog.groupsText;

  return `${preferredBlock}CATALOG BOARDS:\n${catalogBlock}`;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const GENERIC_SHARE_TITLES = /^(instagram share|shared from instagram|youtube|tiktok|shared link|web page)$/i;

const MAX_BOOKMARK_TITLE = 40;
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

function isBarePlatformName(title: string): boolean {
  return PLATFORM_NAMES.has(title.trim().toLowerCase());
}

function isGenericShareTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (GENERIC_SHARE_TITLES.test(trimmed)) return true;
  if (isBarePlatformName(trimmed)) return true;
  if (new RegExp(`^shared from (${PLATFORM_NAME_ALT})\\b`, 'i').test(trimmed)) return true;
  if (new RegExp(`^(${PLATFORM_NAME_ALT})\\s+share$`, 'i').test(trimmed)) return true;
  return false;
}

/** Prefer the first non-generic title from several metadata sources */
function pickBestTitle(candidates: (string | undefined)[], url = ''): string | undefined {
  let fallback: string | undefined;
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const cleaned = cleanPageTitle(raw, url);
    if (!isGenericShareTitle(cleaned) && !isPlatformChromeTitle(cleaned)) return cleaned;
    fallback ??= cleaned;
  }
  return fallback;
}

function pickBestDescription(candidates: (string | undefined)[]): string {
  let best = '';
  for (const raw of candidates) {
    const desc = (raw ?? '').trim();
    if (desc.length > best.length) best = desc;
  }
  return best;
}

function cleanPageTitle(raw: string, url = ''): string {
  let title = raw.trim();

  // Generic: "Account • Platform photo/video/post" — works for any platform name
  const platformChrome = title.match(
    new RegExp(
      `^(.+?)\\s*[•·\\-–—]\\s*(${PLATFORM_NAME_ALT})\\s+(${PLATFORM_CONTENT_TYPES})`,
      'i',
    ),
  );
  if (platformChrome) {
    return platformChrome[1].trim().slice(0, 120);
  }

  // Generic: "Account on Platform: \"caption...\"" — any supported platform
  const onPlatformMatch = title.match(
    new RegExp(`^(.+?) on (${PLATFORM_NAME_ALT}):\\s*"([^"]{0,120})`, 'i'),
  );
  if (onPlatformMatch) {
    const caption = onPlatformMatch[3].trim();
    if (caption.length > 10) return caption.slice(0, 120);
    return onPlatformMatch[1].trim();
  }

  // YouTube-style: "Video Title | Channel" (pipe separator is YouTube-specific)
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

const CACHE_VERSION = 19;;
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const CACHE_STRIP_QUERY = new Set(['fbclid', 'gclid', 'si', 'is', 'feature', 'igsh', 'igshid']);

/** Canonical URL for cache keys — strip tracking params, normalize YouTube IDs */
function normalizeUrlForCache(url: string): string {
  try {
    const ytId = extractYouTubeVideoId(url);
    if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;

    const parsed = new URL(normalizeUrl(url));
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';

    for (const key of [...parsed.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || CACHE_STRIP_QUERY.has(lower)) {
        parsed.searchParams.delete(key);
      }
    }

    const cleaned = parsed.toString();
    return cleaned.endsWith('?') ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url.trim();
  }
}

async function hashUrlForCache(normalizedUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedUrl));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type ClassificationSource = 'gemini' | 'groq' | 'heuristic';

type ClassificationOutcome = {
  result: ClassifyResult;
  source: ClassificationSource;
};

type CachedClassification = {
  board_name: string;
  title: string;
  description: string;
  source: ClassificationSource;
};

function createServiceSupabaseClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set — classification cache disabled');
    return null;
  }
  return createClient(url, key);
}

function shouldCacheClassification(
  result: ClassifyResult,
  metadata: LinkMetadata,
  url: string,
): boolean {
  if (isPlatformBoardName(result.board_name) || isGenericBoardName(result.board_name)) return false;
  if (isGenericMediaBoard(result.board_name)) return false;
  if (result.board_name.toLowerCase() === 'ideas') return false;
  if (result.board_name === 'Shopping' && !isCommerceUrl(url)) return false;
  if (result.board_name === 'Tutorials' && isSparseMetadata(metadata, url)) return false;
  if (isGenericShareTitle(result.title)) return false;
  if (!result.title.trim() || !result.description.trim() || !result.board_name.trim()) return false;
  return true;
}

async function lookupClassificationCache(
  serviceClient: SupabaseClient,
  urlHash: string,
): Promise<CachedClassification | null> {
  const { data, error } = await serviceClient
    .from('link_classification_cache')
    .select('board_name, title, description, source, cache_version, expires_at')
    .eq('url_hash', urlHash)
    .eq('cache_version', CACHE_VERSION)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  await serviceClient.rpc('increment_classification_cache_hit', { p_url_hash: urlHash });

  return {
    board_name: data.board_name,
    title: data.title,
    description: data.description,
    source: data.source as ClassificationSource,
  };
}

async function saveClassificationCache(
  serviceClient: SupabaseClient,
  urlHash: string,
  normalizedUrl: string,
  outcome: ClassificationOutcome,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  const { error } = await serviceClient.from('link_classification_cache').upsert(
    {
      url_hash: urlHash,
      url: normalizedUrl,
      board_name: outcome.result.board_name,
      title: outcome.result.title,
      description: outcome.result.description,
      source: outcome.source,
      cache_version: CACHE_VERSION,
      expires_at: expiresAt,
    },
    { onConflict: 'url_hash' },
  );
  if (error) console.error('Classification cache write failed', error.message);
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /embed\/([^?&]+)/,
    /\/shorts\/([^?&/]+)/,
  ];
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
  let cleaned = cleanMetadataDescription(desc);
  cleaned = cleaned.replace(/\s*original title:\s*.+$/i, '').trim();
  if (isBoilerplateDescription(cleaned)) return '';
  return summarizeDescription(cleaned, MAX_BOOKMARK_DESC);
}

function getAllowedBoardNames(userBoards: string[], catalog: BoardCatalog): string[] {
  const merged = new Map<string, string>();
  for (const name of catalog.names) merged.set(name.toLowerCase(), name);
  for (const name of userBoards) {
    if (!isPlatformBoardName(name) && !isGenericBoardName(name)) {
      merged.set(name.toLowerCase(), name);
    }
  }
  return [...merged.values()];
}

function normalizeToAllowedBoard(
  name: string,
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): string {
  const trimmed = name.trim();
  const userMatch = userBoards.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  if (userMatch) return userMatch;

  const catalogMatch = findInCatalog(trimmed, catalog);
  if (catalogMatch) return catalogMatch;

  return resolveFallbackBoard(metadata, url, userBoards, catalog);
}

function hasRichMetadata(metadata: LinkMetadata, url: string): boolean {
  if (isSparseMetadata(metadata, url)) return false;
  const title = metadata.title.trim();
  const desc = metadata.description.trim();
  return desc.length >= 50 || title.length >= 15;
}

function isSocialPostUrl(url: string): boolean {
  return isSocialContentUrl(url);
}

function shouldUseVision(
  metadata: LinkMetadata,
  url: string,
  boardPick: { board_name: string } | null,
): boolean {
  if (!metadata.image) return false;
  if (!isSparseMetadata(metadata, url)) return false;
  if (!isSocialPostUrl(url)) return false;
  return !boardPick || isGenericBoardName(boardPick.board_name);
}

function pickExistingOrCatalog(userBoards: string[], catalogName: string, catalog: BoardCatalog): string {
  const existing = userBoards.find((b) => b.toLowerCase() === catalogName.toLowerCase());
  if (existing) return existing;
  return findInCatalog(catalogName, catalog) ?? findInCatalog('Shopping', catalog) ?? catalog.names[0] ?? catalogName;
}

function pickBilingualBoard(
  userBoards: string[],
  english: string,
  spanish: string,
  catalog: BoardCatalog,
): string {
  for (const name of [english, spanish]) {
    const existing = userBoards.find((b) => b.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const inCatalog = findInCatalog(name, catalog);
    if (inCatalog) return inCatalog;
  }
  return pickExistingOrCatalog(userBoards, english, catalog);
}

/** Skip platform-generated descriptions that cause false topic matches (e.g. "video", "short") */
function isBoilerplateDescription(description: string): boolean {
  const d = description.trim().toLowerCase();
  if (d.length < 20) return true;
  return /\b(subscribe|like and subscribe|share your videos|upload your videos|upload original content|watch full video|enjoy the videos|share it all with friends|youtube\.com|tiktok\.com|instagram\.com)\b/i.test(d);
}

/**
 * Heuristic topic rules — two layers, applied consistently across all domains:
 *   1. Umbrella — category nouns (food, recipe, cocina, fitness, travel…)
 *   2. Methods — generic actions/processes in that domain (bake, roast, train, code, paint…)
 * Never: specific entities (paella, pimientos), scene props (lumbre), or media format (video, reel).
 * Titles with only entity names and no umbrella/method → skip heuristics → Gemini.
 */
const GENERIC_TOPIC_RULES: { pattern: RegExp; en: string; es: string }[] = [
  {
    // Food: umbrella + cooking methods (not ingredients or dish names)
    pattern: /\b(recipes?|cooking|food|kitchen|ingredients?|meals?|chef|cuisine|restaurants?|breakfast|lunch|dinner|snacks?|desserts?|gastronomy|gastronom[ií]a|comida|cocina|recetas?|restaurante|desayuno|almuerzo|cena|postre|merienda|reposter[ií]a|baking|bake|roast|roasted|grill|grilled|grilling|fry|fried|frying|simmer|stew|stewing|boil|boiling|steam|steaming|saut[eé]|braise|prep|hornear|horneado|cocinar|asar|asado|asados|fre[ií]r|frito|guisar|guiso|marinar|marinade|hervir|vapor|saltear|plancha|parrilla)\b/i,
    en: 'Recipes',
    es: 'Recetas',
  },
  {
    // Learning: umbrella + teaching/learning actions
    pattern: /\b(tutorials?|how\s+to|guides?|lessons?|courses?|step[\s-]by[\s-]step|explained|walkthrough|tutoriales|gu[ií]as|lecciones|cursos|aprende|aprender|ense[nñ]a|explica|demuestra|instalar|configurar|arreglar|setup|install|fix|repair|teach|learn|explain|demonstrate)\b/i,
    en: 'Tutorials',
    es: 'Tutoriales',
  },
  {
    // Fashion: umbrella + wearing/styling actions
    pattern: /\b(fashion|clothing|apparel|outfits?|styles?|wear|streetwear|moda|ropa|estilos?|lookbook|vestir|combinar|lucir|outfit|styling|dress|dressing)\b/i,
    en: 'Fashion',
    es: 'Moda',
  },
  {
    // Travel: umbrella + trip actions
    pattern: /\b(travel|trips?|hotels?|flights?|vacations?|tourism|itinerary|viajes?|vuelos?|turismo|vacaciones|destinos?|escapada|fly|flying|visit|visiting|explore|exploring|book(?:ing)?|road\s*trips?|volar|visitar|explorar|reservar|itinerario)\b/i,
    en: 'Travel',
    es: 'Viajes',
  },
  {
    // Fitness: umbrella + training actions
    pattern: /\b(workouts?|gyms?|fitness|exercises?|yoga|pilates|crossfit|trainings?|entrenamiento|gimnasio|ejercicios?|train|training|lift|lifting|run|running|jog|jogging|stretch|stretching|correr|levantar|estirar|entrenar)\b/i,
    en: 'Fitness',
    es: 'Fitness',
  },
  {
    // Code: umbrella + dev actions
    pattern: /\b(programming|coding|developers?|software|javascript|python|react|devops|programaci[oó]n|c[oó]digo|desarrolladores?|debug|debugging|deploy|deploying|refactor|implement|implementing|build(?:ing)?|programar|depurar|implementar|desplegar)\b/i,
    en: 'Programming',
    es: 'Programación',
  },
  {
    // Tech: umbrella + review/test actions
    pattern: /\b(technology|tech|gadgets?|smartphones?|hardware|reviews?|tecnolog[ií]a|ordenadores?|m[oó]viles?|unbox|unboxing|benchmark|benchmarking|test(?:ing)?|compare|comparing|comparar|probar|analizar)\b/i,
    en: 'Technology',
    es: 'Tecnología',
  },
  {
    pattern: /\b(ai\b|artificial intelligence|machine learning|chatgpt|gemini|claude|inteligencia artificial|prompt(?:ing)?)\b/i,
    en: 'AI',
    es: 'IA',
  },
  {
    // Gaming: umbrella + play actions
    pattern: /\b(gaming|video\s*games?|gameplay|playthroughs?|esports|videojuegos?|jugadores?|streamers?|speedrun|walkthrough|play(?:ing)?|streaming|jugar|partida|stream(?:ing)?)\b/i,
    en: 'Gaming',
    es: 'Gaming',
  },
  {
    // Film/TV: platforms, numbered seasons/episodes, or explicit tv/web series — NOT bare "series" (→ "series of tools")
    pattern: /\b(netflix|disney\+|hbo|prime\s*video|apple\s*tv\+|pel[ií]culas?|\bcine\b|tv\s+series|web\s+series|mini[\s-]?series|season\s*\d|temporada\s*\d|S\d{1,2}E\d{1,2}|episodes?\s*\d+)\b/i,
    en: 'Film',
    es: 'Cine y series',
  },
  {
    // Music: umbrella + performance actions
    pattern: /\b(music|songs?|concerts?|albums?|playlists?|m[uú]sica|canciones?|conciertos?|[aá]lbumes?|sing|singing|perform|performing|cover|covers|play(?:ing)?|cantar|tocar|interpretar|directo|live\s*set)\b/i,
    en: 'Music',
    es: 'Música',
  },
  {
    // Photo: umbrella + shoot/edit actions
    pattern: /\b(photos?|photography|cameras?|portraits?|fotos?|fotograf[ií]a|c[aá]maras?|shoot|shooting|edit(?:ing)?|fotografiar|editar|retrato)\b/i,
    en: 'Photography',
    es: 'Fotografía',
  },
  {
    // Art: umbrella + creation actions
    pattern: /\b(art|galleries?|museums?|arte|galer[ií]as?|museos?|paint|painting|draw|drawing|sketch|sketching|sculpt|sculpting|illustrat(?:e|ing)|pintar|dibujar|esculpir|ilustrar)\b/i,
    en: 'Art',
    es: 'Arte',
  },
  {
    // Design: umbrella + design actions
    pattern: /\b(design|ui|ux|figma|brandings?|typography|dise[ñn]os?|marcas?|prototype|prototyping|wireframe|mockup|prototipar|dise[nñ]ar)\b/i,
    en: 'Design',
    es: 'Diseño',
  },
  {
    // Beauty: umbrella + routine/application actions
    pattern: /\b(beauty|makeups?|skincare|cosmetics?|belleza|maquillaje|cosm[eé]tica|routines?|apply|applying|maquillar|cuidar|rutina)\b/i,
    en: 'Beauty',
    es: 'Belleza',
  },
  {
    // Home: compound home topics — NOT bare "home" (ambiguous)
    pattern: /\b(home\s*decor|home\s*improvement|furniture|interiors?|kitchenware|hogar|muebles?|decoraci[oó]n|interiorismo|renovat(?:e|ing)|organiz(?:e|ing)|decorat(?:e|ing)|renovar|organizar|decorar)\b/i,
    en: 'Home',
    es: 'Hogar',
  },
  {
    // Finance: umbrella + money actions
    pattern: /\b(finance|money|budgets?|savings?|invest(?:ing|ment)?|stocks?|crypto|finanzas|ahorro|presupuestos?|inversi[oó]n|bolsa|trade|trading|budget(?:ing)?|save|saving|invertir|ahorrar|presupuestar)\b/i,
    en: 'Finance',
    es: 'Finanzas',
  },
  {
    // Health: umbrella + wellness actions
    pattern: /\b(health|wellness|medical|nutrition|mental\s*health|salud|bienestar|nutrici[oó]n|meditat(?:e|ing)|recover(?:y|ing)|heal(?:ing)?|meditar|recuperar|sanar|cuidar)\b/i,
    en: 'Health',
    es: 'Salud',
  },
  {
    pattern: /\b(news|breaking|headlines?|noticias|actualidad|prensa|report(?:ing)?|informar|reportaje)\b/i,
    en: 'News',
    es: 'Noticias',
  },
  {
    // Education: umbrella + study/teach actions
    pattern: /\b(education|schools?|universities|academic|educaci[oó]n|escuelas?|universidades?|stud(?:y|ying)|teach|teaching|lectures?|estudiar|ense[nñ]ar|clase)\b/i,
    en: 'Education',
    es: 'Educación',
  },
  {
    // Business: umbrella + business actions
    pattern: /\b(business|startups?|entrepreneurs?|marketing|saas|negocios?|emprendimiento|empresas?|launch(?:ing)?|scale|scaling|pitch|pitching|sell|selling|lanzar|vender|escalar)\b/i,
    en: 'Business',
    es: 'Negocios',
  },
  {
    // Reading: umbrella + read/review actions
    pattern: /\b(books?|readings?|novels?|ebooks?|audiobooks?|libros?|lecturas?|novelas?|read(?:ing)?|leer|rese[nñ]a|review)\b/i,
    en: 'Reading',
    es: 'Lecturas',
  },
  {
    // DIY: umbrella + making actions
    pattern: /\b(diy|handmade|crafts?|manualidades|bricolaje|build(?:ing)?|mak(?:e|ing)|construct(?:ing)?|fabricat(?:e|ing)|construir|fabricar|hacer)\b/i,
    en: 'DIY',
    es: 'DIY',
  },
  {
    pattern: /\b(inspir|motivat|mindset|quotes?|wisdom|inspiraci[oó]n|motivaci[oó]n|frases?)\b/i,
    en: 'Inspiration',
    es: 'Inspiración',
  },
  {
    pattern: /\b(meme|humor|funny|viral|chistes?|gracioso)\b/i,
    en: 'Memes',
    es: 'Memes',
  },
  {
    // Shopping: umbrella + purchase actions
    pattern: /\b(shopping|shops?|stores?|buy(?:ing)?|purchas(?:e|ing)|compras?|tiendas?|ofertas?|rebajas?|comprar|adquir)\b/i,
    en: 'Shopping',
    es: 'Compras',
  },
];

/**
 * Single-word board names / keywords that are common English — never match from title alone.
 * Multi-word boards ("TV Series", "Home Decor") are still matched. Ambiguous titles → AI.
 */
const AMBIGUOUS_BOARD_WORDS = new Set([
  'house', 'home', 'series', 'art', 'pop', 'rock', 'food', 'film', 'films', 'movie', 'movies',
  'game', 'games', 'news', 'tech', 'design', 'shop', 'work', 'life', 'love', 'fit', 'health',
  'music', 'video', 'videos', 'book', 'books', 'read', 'sport', 'sports', 'travel', 'fitness',
  'business', 'play', 'season', 'seasons', 'episode', 'episodes', 'trailer', 'watch', 'review',
  'ideas', 'film', 'cine', 'moda', 'arte', 'hogar', 'comida', 'música', 'musica',
]);

/**
 * "X of Y" titles — X is usually English, not a topic (series of tools, house of dragon, game of thrones).
 * Never classify these with heuristics; AI + user boards handle them.
 */
function isAmbiguousOfTitle(text: string): boolean {
  return /\b(house|series|game|lord|land|set|kind|type|class|world|art|state|piece|number|variety|range|line|collection|group|string|sort|form|brand|batch|box|pair|couple|lot|bit|touch|lack|sense|course|variety|men|women|set|array|list|selection|assortment|lineup|bunch|pack|set)\s+of\b/i
    .test(text.trim());
}

function matchGenericTopic(text: string, userBoards: string[], catalog: BoardCatalog): string | null {
  const trimmed = text.trim();
  if (!trimmed || isAmbiguousOfTitle(trimmed)) return null;
  for (const rule of GENERIC_TOPIC_RULES) {
    if (rule.pattern.test(trimmed)) {
      return pickBilingualBoard(userBoards, rule.en, rule.es, catalog);
    }
  }
  return null;
}

/** Never match single-word ambiguous board names from title (Series, House, Home…) — use AI + user boards */
function titleMentionsBoard(title: string, boardName: string): boolean {
  const name = boardName.trim();
  if (name.length < 3) return false;
  if (isAmbiguousOfTitle(title)) return false;

  const nameLower = name.toLowerCase();
  if (!name.includes(' ') && AMBIGUOUS_BOARD_WORDS.has(nameLower)) {
    return false;
  }

  if (name.includes(' ')) {
    return title.toLowerCase().includes(nameLower);
  }

  const escaped = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(title);
}

function inferTopicBoard(
  metadata: LinkMetadata,
  userBoards: string[],
  catalog: BoardCatalog,
): string | null {
  const title = metadata.title.trim();
  if (title) {
    const fromTitle = matchGenericTopic(title, userBoards, catalog);
    if (fromTitle) return fromTitle;
    // Long specific title with no keyword match — don't trust description boilerplate
    if (title.length >= 20) return null;
  }

  const desc = metadata.description.trim();
  if (!desc || isBoilerplateDescription(desc)) return null;
  return matchGenericTopic(desc, userBoards, catalog);
}

function resolveFallbackBoard(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): string {
  if (/\/products?\//i.test(url)) {
    return pickExistingOrCatalog(userBoards, 'Fashion', catalog);
  }
  if (isCommerceUrl(url)) {
    return pickExistingOrCatalog(userBoards, 'Shopping', catalog);
  }

  for (const board of userBoards) {
    if (isPlatformBoardName(board)) continue;
    if (titleMentionsBoard(metadata.title, board)) return board;
  }

  const specific = inferGranularBoard(metadata, url);
  if (specific && !isRejectableBoardName(specific)) {
    return pickExistingOrCatalog(userBoards, specific, catalog);
  }

  const topic = inferTopicBoard(metadata, userBoards, catalog);
  if (topic && !isRejectableBoardName(topic)) return topic;

  return pickExistingOrCatalog(userBoards, 'Ideas', catalog);
}

/** Safe catch-all boards when both AI providers fail — no topic keyword matching */
const AI_UNAVAILABLE_FALLBACK_BOARDS = ['Ideas', 'Inspiration', 'Inspiración'];

function pickAiUnavailableBoard(userBoards: string[], catalog: BoardCatalog): string {
  for (const name of AI_UNAVAILABLE_FALLBACK_BOARDS) {
    const existing = userBoards.find((b) => b.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const inCatalog = findInCatalog(name, catalog);
    if (inCatalog) return inCatalog;
  }
  return pickExistingOrCatalog(userBoards, 'Ideas', catalog);
}

function aiUnavailableFallbackOutcome(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
): ClassificationOutcome {
  const boardName = pickAiUnavailableBoard(boards.map((b) => b.name), catalog);
  console.log('Classified with generic fallback (AI unavailable)', { board: boardName });
  return heuristicClassificationOutcome(boards, metadata, url, boardName, catalog);
}

/** Primary classifier: commerce URLs + generic topic keywords (title-first). */
function tryHeuristicBoard(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): { confident: boolean; board_name: string } | null {
  if (/\/products?\//i.test(url)) {
    return { confident: true, board_name: pickExistingOrCatalog(userBoards, 'Fashion', catalog) };
  }
  if (isCommerceUrl(url)) {
    return { confident: true, board_name: pickExistingOrCatalog(userBoards, 'Shopping', catalog) };
  }

  // "X of Y" titles and entity-only names → not confident; AI + user boards decide
  if (isAmbiguousOfTitle(metadata.title.trim())) {
    return null;
  }

  const specific = inferGranularBoard(metadata, url);
  if (specific && !isRejectableBoardName(specific)) {
    return { confident: true, board_name: pickExistingOrCatalog(userBoards, specific, catalog) };
  }

  const topic = inferTopicBoard(metadata, userBoards, catalog);
  if (topic && !isRejectableBoardName(topic)) {
    return { confident: true, board_name: topic };
  }

  return null;
}

function heuristicClassificationOutcome(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  catalog: BoardCatalog,
): ClassificationOutcome {
  const boardList = boards.map((b) => b.name);
  return {
    source: 'heuristic',
    result: polishClassifyResult(
      {
        board_name: boardName,
        title: buildTitleFromMetadata(metadata, url, boardName),
        description: buildDescriptionFromMetadata(metadata, url, boardName),
        is_new_board: !boards.some((b) => b.name.toLowerCase() === boardName.toLowerCase()),
      },
      metadata,
      url,
      boardList,
      catalog,
    ),
  };
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
  const [noembed, microlink, oembed] = await Promise.all([
    fetchNoembed(url),
    fetchMicrolink(url),
    fetchOEmbed(url),
  ]);

  const title = pickBestTitle([noembed.title, oembed.title, microlink.title], url);
  const description = pickBestDescription([noembed.description, oembed.description, microlink.description]);
  const image = noembed.image ?? oembed.image ?? microlink.image ?? null;

  if (!title && !description && !image) return {};

  const source = noembed.title && title === cleanPageTitle(noembed.title, url) ? 'noembed'
    : oembed.title && title === cleanPageTitle(oembed.title, url) ? 'oembed'
    : microlink.title ? 'microlink'
    : 'merged';

  return { title, description, image, source };
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

      const oembed = await fetchOEmbed(fetchUrl);

      const rawTitle = pickBestTitle(
        [playerData.title, oembed.title, ogTitle, external.title, fallbackTitle],
        fetchUrl,
      ) ?? fallbackTitle;
      const title = cleanPageTitle(rawTitle, fetchUrl);
      const description = summarizeDescription(
        pickBestDescription([playerData.description, oembed.description, ogDesc, external.description]),
      );

      const source = playerData.title && title === cleanPageTitle(playerData.title, fetchUrl) ? 'player'
        : oembed.title && title === cleanPageTitle(oembed.title, fetchUrl) ? 'oembed'
        : ogTitle ? 'og'
        : external.source ?? 'fallback';

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

function isGenericMediaBoard(name: string): boolean {
  return GENERIC_MEDIA_BOARD_NAMES.has(name.trim().toLowerCase());
}

/** Boards that must never be saved — platform/format junk only (broad topics like Fitness are OK) */
function isRejectableBoardName(name: string): boolean {
  return isPlatformBoardName(name) || isGenericBoardName(name) || isGenericMediaBoard(name);
}

const MUSIC_BOARDS = new Set([
  'hip-hop', 'techno', 'jazz', 'house', 'electronic', 'rock', 'pop', 'r&b', 'classical', 'folk', 'latin',
]);

const MUSIC_PERFORMANCE =
  /\b(freestyle|hip[\s-]?hop|\brap\b|cypher|beatbox|\bmc\b|\bbars\b|spitting|flow\b|rimas|freestyle rap|batalla)\b/i;

/**
 * Refine a broad Gemini pick using title-only cues (sports scorelines, unambiguous genres).
 * NOT used for primary classification — never reads description (platform boilerplate).
 */
function inferGranularBoard(metadata: LinkMetadata, url: string): string | null {
  if (/\/products?\//i.test(url)) return 'Fashion';
  if (isCommerceUrl(url)) return 'Shopping';

  const title = metadata.title.trim();
  if (!title) return null;

  if (isAmbiguousOfTitle(title)) return null;

  if (/\d+\s*[–\-—]\s*\d+/.test(title)) return 'Football';
  if (MUSIC_PERFORMANCE.test(title)) return 'Hip-Hop';

  const rules: [RegExp, string][] = [
    [/\b(formula\s*1|\bf1\b|grand prix|motogp)\b/i, 'Formula 1'],
    [/\b(mma|ufc|bellator)\b/i, 'MMA'],
    [/\b(tennis|wimbledon|atp|wta)\b/i, 'Tennis'],
    [/\b(basketball|nba|wnba|euroleague)\b/i, 'Basketball'],
    [/\b(football|soccer|fifa|premier\s*league|la\s*liga|champions\s*league)\b/i, 'Football'],
    [/\b(gabber|hardcore|hard\s*techno|techno|berghain)\b/i, 'Techno'],
    [/\b(deep\s*house|tech\s*house|house\s*music|house\s*(mix|set))\b/i, 'House'],
    [/\b(hip[\s-]?hop|\brap\b|drill|trap|grime)\b/i, 'Hip-Hop'],
    [/\b(jazz|bebop|blues)\b/i, 'Jazz'],
    [/\b(k[\s-]?pop)\b/i, 'K-Pop'],
    [/\b(reggaeton|salsa|bachata)\b/i, 'Latin'],
    [/\b(crossfit|calisthenics|plank|guinness\s*world)\b/i, 'CrossFit'],
  ];

  for (const [pattern, board] of rules) {
    if (pattern.test(title)) return board;
  }

  if (isLikelyFootball(title, '')) return 'Football';

  return null;
}

function refineBoardName(
  name: string,
  metadata: LinkMetadata,
  url: string,
  existingBoards: string[],
  catalog: BoardCatalog,
): string {
  let refined = normalizeToAllowedBoard(name, metadata, url, existingBoards, catalog);
  if (isBroadBoardName(refined)) {
    const inferred = inferGranularBoard(metadata, url);
    if (inferred) refined = pickExistingOrCatalog(existingBoards, inferred, catalog);
  }
  return validateBoardChoice(refined, metadata, url, existingBoards, catalog);
}

/** Correct common mislabels (e.g. rap reel classified as Art) */
function validateBoardChoice(
  board: string,
  metadata: LinkMetadata,
  url: string,
  existingBoards: string[],
  catalog: BoardCatalog,
): string {
  const text = `${metadata.title} ${metadata.description}`;
  const boardLower = board.trim().toLowerCase();

  const userMatch = existingBoards.find((b) => b.toLowerCase() === boardLower);
  if (userMatch) return userMatch;

  if (isRejectableBoardName(board)) {
    const refined = inferGranularBoard(metadata, url);
    if (refined && !isRejectableBoardName(refined)) {
      return pickExistingOrCatalog(existingBoards, refined, catalog);
    }
    const topic = inferTopicBoard(metadata, existingBoards, catalog);
    if (topic && !isRejectableBoardName(topic)) {
      return pickExistingOrCatalog(existingBoards, topic, catalog);
    }
    return pickExistingOrCatalog(existingBoards, 'Ideas', catalog);
  }

  if (isBroadBoardName(board)) {
    const inferred = inferGranularBoard(metadata, url);
    if (inferred) {
      return pickExistingOrCatalog(existingBoards, inferred, catalog);
    }
    return pickExistingOrCatalog(existingBoards, board, catalog);
  }

  const inferred = inferGranularBoard(metadata, url);

  if (inferred && boardLower === 'art' && (MUSIC_PERFORMANCE.test(text) || MUSIC_BOARDS.has(inferred.toLowerCase()))) {
    const preferred = existingBoards.find((b) => b.toLowerCase() === inferred.toLowerCase()) ??
      findInCatalog('Hip-Hop', catalog);
    return preferred ?? pickExistingOrCatalog(existingBoards, inferred, catalog);
  }

  return board;
}

function isPlatformChromeTitle(title: string): boolean {
  if (new RegExp(`[•·]\\s*(${PLATFORM_NAME_ALT})\\s+(${PLATFORM_CONTENT_TYPES})`, 'i').test(title)) {
    return true;
  }
  if (new RegExp(`\\bon\\s+(${PLATFORM_NAME_ALT})\\b`, 'i').test(title)) return true;
  if (new RegExp(`^(${PLATFORM_CONTENT_TYPES}|shared link|web page)$`, 'i').test(title.trim())) return true;
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

/** Parse AI board pick — only reject platform names; weak boards (Fitness) are refined, not dropped */
function acceptAiBoardPick(
  rawBoard: string | undefined,
  metadata: LinkMetadata,
  url: string,
  boardList: string[],
  catalog: BoardCatalog,
  provider: string,
): string | null {
  if (!rawBoard?.trim()) {
    console.log(`${provider}: no board in response`);
    return null;
  }
  if (isPlatformBoardName(rawBoard)) {
    console.log(`${provider}: platform board rejected`, { board: rawBoard });
    return null;
  }
  return refineBoardName(rawBoard, metadata, url, boardList, catalog);
}

function isBadBoardName(name: string): boolean {
  if (isRejectableBoardName(name)) return true;
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

function youtubeVideoTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ');
  return (pipeIdx > 0 ? title.slice(0, pipeIdx) : title).trim();
}

/** Strip venue/session noise from music video titles for short labels */
function compactMusicSubject(raw: string): string {
  let t = youtubeVideoTitle(raw);
  const venueSplit = t.split(/\s+(?:en|@)\s+/i);
  if (venueSplit[0]?.trim()) t = venueSplit[0].trim();
  t = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return t.replace(/\b(FT\.?|FEAT\.?|FEATURING)\b/gi, ' x ').replace(/\s+/g, ' ').trim();
}

function musicTitlePrefix(raw: string): string {
  if (/\b(freestyle|cypher|grime|drill|trap|spitting|bars)\b/i.test(raw)) return 'Freestyle';
  if (/\b(live|concert|session|set)\b/i.test(raw)) return 'Live';
  return 'Track';
}

function compactMusicTitle(raw: string): string {
  const subject = compactMusicSubject(raw);
  const prefix = musicTitlePrefix(raw);
  return `${prefix}: ${subject}`.slice(0, MAX_BOOKMARK_TITLE);
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

  if (board === 'recipes' || board === 'recetas' || /\b(recipe|cooking|how to make|baking|receta|cocina)\b/i.test(raw)) {
    const dish = raw.replace(/^(recipe|how to make|cooking|receta)\s*[:\-–—]?\s*/i, '').trim() || raw;
    const prefix = board === 'recetas' ? 'Receta' : 'Recipe';
    return `${prefix}: ${dish}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'fashion' || board === 'shopping' || board === 'home') {
    return `Product: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
  }

  if (board === 'techno' || board === 'house' || board === 'electronic' || /\b(gabber|techno|hardcore|dj|rave|festival)\b/i.test(raw)) {
    if (/\b(live|set|promo|festival|warehouse|@)\b/i.test(raw)) {
      return compactMusicTitle(raw).replace(/^Track:/, 'Live set:');
    }
    return compactMusicTitle(raw);
  }

  if (board === 'hip-hop' || board === 'jazz' || board === 'rock' || board === 'pop' || board === 'r&b' || board === 'classical' || board === 'folk' || board === 'latin' || board === 'grime' || board === 'drill' || board === 'trap') {
    return compactMusicTitle(raw);
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

function isLikelyFootball(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  if (/\d+\s*[–\-—]\s*\d+/.test(title)) return true;
  return /\b(football|soccer|fifa|world cup|copa mundial|resumen|highlights|vs\.?| v )\b/i.test(text);
}

function buildDescriptionFromMetadata(metadata: LinkMetadata, url: string, boardName?: string): string {
  const raw = youtubeVideoTitle(metadata.title);
  const board = boardName?.toLowerCase() ?? '';
  const scoreline = parseFootballScoreline(raw);

  if (scoreline || board === 'football' || isLikelyFootball(metadata.title, metadata.description)) {
    if (scoreline) {
      return summarizeDescription(footballDescription(scoreline, metadata), MAX_BOOKMARK_DESC);
    }
  }

  const desc = metadata.description.trim();
  const usableDesc = desc && !isBoilerplateDescription(desc) ? desc : '';

  if (usableDesc.length > 20 && !/^by /i.test(usableDesc)) {
    return summarizeDescription(cleanMetadataDescription(usableDesc), MAX_BOOKMARK_DESC);
  }

  const musicBoards = new Set([
    'hip-hop', 'techno', 'house', 'electronic', 'jazz', 'rock', 'pop', 'r&b', 'classical', 'folk', 'latin',
    'grime', 'drill', 'trap', 'reggaeton', 'k-pop', 'música',
  ]);
  if (musicBoards.has(board) && raw) {
    const subject = compactMusicSubject(raw);
    const genre = boardName ?? 'music';
    return summarizeDescription(`${genre} content featuring ${subject}.`, MAX_BOOKMARK_DESC);
  }

  if (raw) {
    const subject = compactMusicSubject(raw) || raw;
    if (boardName) {
      return summarizeDescription(`${boardName}: ${subject}.`, MAX_BOOKMARK_DESC);
    }
    return summarizeDescription(`${subject}.`, MAX_BOOKMARK_DESC);
  }

  if (boardName) {
    return summarizeDescription(`${boardName}.`, MAX_BOOKMARK_DESC);
  }

  return '';
}

function polishClassifyResult(
  result: ClassifyResult,
  metadata: LinkMetadata,
  url: string,
  existingBoards: string[] = [],
  catalog: BoardCatalog = FALLBACK_CATALOG,
): ClassifyResult {
  result.board_name = refineBoardName(result.board_name, metadata, url, existingBoards, catalog);

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
  if (!result.description.trim() || isBoilerplateDescription(result.description)) {
    result.description = buildDescriptionFromMetadata(metadata, url, result.board_name);
  }
  if (result.title.length > MAX_BOOKMARK_TITLE || result.title.toLowerCase() === rawMetaTitle.toLowerCase()) {
    const rebuilt = buildTitleFromMetadata(metadata, url, result.board_name);
    if (rebuilt.length <= MAX_BOOKMARK_TITLE) result.title = rebuilt;
  }
  return result;
}

function resolveGenericBoard(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
): { board_name: string; is_new_board: boolean } {
  const userBoards = boards.map((b) => b.name);
  const board_name = resolveFallbackBoard(metadata, url, userBoards, catalog);
  const existing = boards.find((b) => b.name.toLowerCase() === board_name.toLowerCase());
  return { board_name: existing?.name ?? board_name, is_new_board: !existing };
}

const AI_BOARD_RULES = `- USER BOARDS (listed first) have highest priority — if the link fits one, pick that exact name
- Broad boards (Fitness, Food, Travel, Sport) are valid when the link fits many sub-topics — do not force a narrow pick
- Prefer a specific catalog match only when no user board fits (K-Pop not Pop, Recipes for cooking)
- Classify by SUBJECT/TOPIC — NOT by media format
- NEVER pick Video, Vídeo, Posts, Content, Entertainment as format catch-alls
- Freestyle / rap / hip-hop → Hip-Hop (NOT Art)
- Clothing / product pages → Fashion, Sneakers, or Shopping
- Art = paintings, illustrations — NOT music performances`;

function buildBoardPrompt(
  url: string,
  metadata: LinkMetadata,
  allowedBoardsPrompt: string,
): string {
  return `Pick ONE board from ALLOWED BOARDS ONLY for this saved link.

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}

ALLOWED BOARDS (pick exactly one name from this list):
${allowedBoardsPrompt}

Rules:
${AI_BOARD_RULES}

JSON only: {"board_name":"...","is_new_board":true|false}`;
}

function buildUnifiedClassifyPrompt(
  url: string,
  metadata: LinkMetadata,
  allowedBoardsPrompt: string,
): string {
  return `Classify this saved link. Pick board from ALLOWED BOARDS ONLY and write title + description.

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}

ALLOWED BOARDS:
${allowedBoardsPrompt}

board_name: MUST be exactly one name from ALLOWED BOARDS
title (max ${MAX_BOOKMARK_TITLE}): short label as [type] + [subject], not raw page title
description (max ${MAX_BOOKMARK_DESC}): 1–2 sentences about content — NEVER likes/comments/views/followers
is_new_board: true only if user does not already have this board

${AI_BOARD_RULES}

JSON only: {"board_name":"...","title":"...","description":"...","is_new_board":true|false}`;
}

function buildTitleDescriptionPrompt(
  url: string,
  metadata: LinkMetadata,
  boardName: string,
): string {
  return `Write a short title and description for this saved link. Board: "${boardName}".

URL: ${url}
Page title: ${metadata.title}
Page description: ${metadata.description || '(none)'}

title (max ${MAX_BOOKMARK_TITLE} chars): short label as [type]: [subject] — NOT the raw page title.
  Good: "Freestyle: EAZYBOI x TRIPLO" (28 chars)
  Bad: "Track: EAZYBOI FT TRIPLO en 2SPICY CORNER (GRIMEY x PALESTINA)" (too long)
description (max ${MAX_BOOKMARK_DESC} chars): 1–2 sentences about WHAT the content is (artists, topic, context).
  NEVER platform boilerplate ("Enjoy the videos...", likes, views, subscribers).
  NEVER append "Original title:".

JSON only: {"title":"...","description":"..."}`;
}

function buildBoardVisionPrompt(
  url: string,
  metadata: LinkMetadata,
  allowedBoardsPrompt: string,
): string {
  return `Pick ONE board from ALLOWED BOARDS using this social post image + metadata.

URL: ${url}
Title: ${metadata.title}
Description: ${metadata.description || '(none)'}

ALLOWED BOARDS (pick exactly one):
${allowedBoardsPrompt}

Rules:
- MUST pick from ALLOWED BOARDS only — pick the most specific TOPIC match
- NEVER pick Video, Vídeo, Music, Música, Tutorials, Entertainment as generic format boards
- Classify what the content is ABOUT (any language)
- Freestyle / rap / hip-hop in image → Hip-Hop (NOT Art)
- Quote / motivation text → Inspiration
- Do NOT pick Hip-Hop for clothing, products, or generic brand pages

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

      // Rate limit — fail fast; retrying burns quota and delays fallback
      if (response.status === 429) {
        console.error('Gemini rate limited (429) — using fallback');
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

/** 70B — unified board + title + description in one call */
const GROQ_MODEL_PRIMARY = 'llama-3.3-70b-versatile';
/** 8B — fast fallback when unified fails or 70B is rate-limited */
const GROQ_MODEL_FALLBACK = 'llama-3.1-8b-instant';

function groqPrimaryModel(): string {
  return Deno.env.get('GROQ_MODEL') ?? GROQ_MODEL_PRIMARY;
}

function groqFallbackModel(): string {
  return Deno.env.get('GROQ_FALLBACK_MODEL') ?? GROQ_MODEL_FALLBACK;
}

async function callGroqModel(prompt: string, apiKey: string, model: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 512,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text === 'string' && text.trim()) return text;
      return null;
    }

    const errorBody = await response.text();
    console.error(`Groq error (${model})`, response.status, errorBody.slice(0, 200));
    return null;
  } catch (error) {
    console.error(`Groq request failed (${model})`, error);
    return null;
  }
}

/** Try models in order; stops at first success. Used for unified (70B) vs fallback (8B). */
async function callGroq(
  prompt: string,
  apiKey: string,
  models: string[],
): Promise<{ text: string; model: string } | null> {
  if (Deno.env.get('SKIP_GROQ') === 'true') return null;

  for (const model of [...new Set(models)]) {
    const text = await callGroqModel(prompt, apiKey, model);
    if (text) return { text, model };
  }

  return null;
}

async function pickBoardWithGroq(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
  allowedBoardsPrompt: string,
  catalog: BoardCatalog,
): Promise<{ board_name: string; is_new_board: boolean } | null> {
  const boardList = boards.map((b) => b.name);
  const response = await callGroq(
    buildBoardPrompt(url, metadata, allowedBoardsPrompt),
    apiKey,
    [groqFallbackModel()],
  );
  const parsed = parseJsonFromGemini<{ board_name: string; is_new_board: boolean }>(response?.text ?? '');
  const board_name = acceptAiBoardPick(
    parsed?.board_name, metadata, url, boardList, catalog, 'Groq board pick',
  );
  if (!board_name) return null;

  return {
    board_name,
    is_new_board: resolveIsNewBoard(board_name, boards, parsed?.is_new_board ?? true),
  };
}

async function classifyWithGroqUnified(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
  allowedBoardsPrompt: string,
  catalog: BoardCatalog,
): Promise<ClassifyResult | null> {
  const boardList = boards.map((b) => b.name);
  const response = await callGroq(
    buildUnifiedClassifyPrompt(url, metadata, allowedBoardsPrompt),
    apiKey,
    [groqPrimaryModel()],
  );
  if (!response) {
    console.log('Groq unified: request failed — using 8B 2-step path');
    return null;
  }
  const parsed = parseJsonFromGemini<ClassifyResult>(response.text);
  if (!parsed?.board_name) {
    console.log('Groq unified: no board in response — using 8B 2-step path', { model: response.model });
    return null;
  }
  if (!parsed.title?.trim() || !parsed.description?.trim()) {
    console.log('Groq unified: missing title or description — using 8B 2-step path', {
      model: response.model,
      board: parsed.board_name,
    });
    return null;
  }

  const board_name = acceptAiBoardPick(
    parsed.board_name, metadata, url, boardList, catalog, 'Groq unified',
  );
  if (!board_name) return null;

  parsed.board_name = board_name;
  parsed.is_new_board = resolveIsNewBoard(parsed.board_name, boards, parsed.is_new_board ?? true);

  console.log('Groq unified: success (1-call)', { model: response.model, board: parsed.board_name });
  return polishClassifyResult(parsed, metadata, url, boardList, catalog);
}

async function generateCopyWithGroq(
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  apiKey: string,
): Promise<{ title: string; description: string } | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await callGroq(
      buildTitleDescriptionPrompt(url, metadata, boardName),
      apiKey,
      [groqFallbackModel()],
    );
    const parsed = parseJsonFromGemini<{ title: string; description: string }>(response?.text ?? '');
    if (!parsed?.title?.trim()) {
      console.log(`Groq copy attempt ${attempt}: no title in response`);
      continue;
    }
    const description = sanitizeBookmarkDescription(parsed.description ?? '') ||
      buildDescriptionFromMetadata(metadata, url, boardName);
    console.log(`Groq copy attempt ${attempt}: ok`, {
      model: response?.model,
      title: parsed.title.trim().slice(0, 40),
    });
    return {
      title: parsed.title.trim().slice(0, MAX_BOOKMARK_TITLE),
      description,
    };
  }
  console.log('Groq copy failed after 2 attempts — using template title/description');
  return null;
}

async function generateCopyWithGemini(
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  apiKey: string,
): Promise<{ title: string; description: string } | null> {
  const text = await callGemini(buildTitleDescriptionPrompt(url, metadata, boardName), apiKey);
  const parsed = parseJsonFromGemini<{ title: string; description: string }>(text ?? '');
  if (!parsed?.title?.trim() || !parsed?.description?.trim()) return null;
  return {
    title: parsed.title.trim().slice(0, MAX_BOOKMARK_TITLE),
    description: sanitizeBookmarkDescription(parsed.description) ||
      buildDescriptionFromMetadata(metadata, url, boardName),
  };
}

async function buildBoardOnlyResult(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  boardPick: { board_name: string; is_new_board: boolean },
  boardList: string[],
  catalog: BoardCatalog,
  copyGen: () => Promise<{ title: string; description: string } | null>,
): Promise<{ result: ClassifyResult; copyFrom: 'ai' | 'template' }> {
  const aiCopy = await copyGen();
  const result = polishClassifyResult(
    {
      board_name: boardPick.board_name,
      title: aiCopy?.title ?? buildTitleFromMetadata(metadata, url, boardPick.board_name),
      description: aiCopy?.description ?? buildDescriptionFromMetadata(metadata, url, boardPick.board_name),
      is_new_board: boardPick.is_new_board,
    },
    metadata,
    url,
    boardList,
    catalog,
  );
  return { result, copyFrom: aiCopy ? 'ai' : 'template' };
}

async function classifyWithGroq(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
): Promise<ClassificationOutcome | null> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return null;

  const boardList = boards.map((b) => b.name);
  const allowedBoardsPrompt = formatAllowedBoardsPrompt(catalog, boardList);

  const unified = await classifyWithGroqUnified(
    boards, metadata, url, apiKey, allowedBoardsPrompt, catalog,
  );
  if (unified) {
    return { source: 'groq', result: unified };
  }

  const boardPick = await pickBoardWithGroq(
    boards, metadata, url, apiKey, allowedBoardsPrompt, catalog,
  );
  if (!boardPick) return null;

  if (isGenericBoardName(boardPick.board_name)) {
    const resolved = resolveGenericBoard(boards, metadata, url, catalog);
    boardPick.board_name = resolved.board_name;
    boardPick.is_new_board = resolved.is_new_board;
  }

  console.log('Groq step 1/2 (8B fallback): board picked', { board: boardPick.board_name });
  const { result, copyFrom } = await buildBoardOnlyResult(
    boards, metadata, url, boardPick, boardList, catalog,
    () => generateCopyWithGroq(metadata, url, boardPick.board_name, apiKey),
  );
  console.log('Classified with Groq (2-step)', {
    board: result.board_name,
    title: result.title,
    copyFrom,
    descLen: result.description.length,
  });
  return { source: 'groq', result };
}

async function pickBoardWithGemini(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
  allowedBoardsPrompt: string,
  catalog: BoardCatalog,
): Promise<{ board_name: string; is_new_board: boolean } | null> {
  const boardList = boards.map((b) => b.name);
  const text = await callGemini(buildBoardPrompt(url, metadata, allowedBoardsPrompt), apiKey);
  const parsed = parseJsonFromGemini<{ board_name: string; is_new_board: boolean }>(text ?? '');
  const board_name = acceptAiBoardPick(
    parsed?.board_name, metadata, url, boardList, catalog, 'Gemini board pick',
  );
  if (!board_name) return null;

  return {
    board_name,
    is_new_board: resolveIsNewBoard(board_name, boards, parsed?.is_new_board ?? true),
  };
}

async function classifyWithGeminiUnified(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
  allowedBoardsPrompt: string,
  catalog: BoardCatalog,
): Promise<ClassifyResult | null> {
  const boardList = boards.map((b) => b.name);
  const text = await callGemini(buildUnifiedClassifyPrompt(url, metadata, allowedBoardsPrompt), apiKey);
  const parsed = parseJsonFromGemini<ClassifyResult>(text ?? '');
  if (!parsed?.board_name || !parsed.title || !parsed.description) return null;

  const board_name = acceptAiBoardPick(
    parsed.board_name, metadata, url, boardList, catalog, 'Gemini unified',
  );
  if (!board_name) return null;

  parsed.board_name = board_name;
  parsed.is_new_board = resolveIsNewBoard(parsed.board_name, boards, parsed.is_new_board ?? true);

  return polishClassifyResult(parsed, metadata, url, boardList, catalog);
}

async function pickBoardWithGeminiVision(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  apiKey: string,
  allowedBoardsPrompt: string,
  catalog: BoardCatalog,
): Promise<{ board_name: string; is_new_board: boolean } | null> {
  if (!metadata.image) return null;

  const imageData = await fetchImageBase64(metadata.image);
  if (!imageData) return null;

  const boardList = boards.map((b) => b.name);
  const text = await callGeminiGenerate(
    [
      { text: buildBoardVisionPrompt(url, metadata, allowedBoardsPrompt) },
      { inline_data: { mime_type: imageData.mimeType, data: imageData.data } },
    ],
    apiKey,
  );
  const parsed = parseJsonFromGemini<{ board_name: string; is_new_board: boolean }>(text ?? '');
  const board_name = acceptAiBoardPick(
    parsed?.board_name, metadata, url, boardList, catalog, 'Gemini vision',
  );
  if (!board_name) return null;

  console.log('Board picked with Gemini vision');
  return {
    board_name,
    is_new_board: resolveIsNewBoard(board_name, boards, parsed?.is_new_board ?? true),
  };
}

async function classifyWithGeminiText(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
): Promise<ClassificationOutcome | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return null;

  const boardList = boards.map((b) => b.name);
  const allowedBoardsPrompt = formatAllowedBoardsPrompt(catalog, boardList);

  if (hasRichMetadata(metadata, url)) {
    const unified = await classifyWithGeminiUnified(
      boards, metadata, url, apiKey, allowedBoardsPrompt, catalog,
    );
    if (unified) {
      console.log('Classified with Gemini text (1-call)', { board: unified.board_name });
      return { source: 'gemini', result: unified };
    }
  }

  let boardPick = await pickBoardWithGemini(
    boards, metadata, url, apiKey, allowedBoardsPrompt, catalog,
  );
  if (!boardPick) return null;

  if (isGenericBoardName(boardPick.board_name)) {
    boardPick = resolveGenericBoard(boards, metadata, url, catalog);
  }

  console.log('Classified with Gemini text (board-only)', { board: boardPick.board_name });
  const { result } = await buildBoardOnlyResult(
    boards, metadata, url, boardPick, boardList, catalog,
    () => generateCopyWithGemini(metadata, url, boardPick.board_name, apiKey),
  );
  return { source: 'gemini', result };
}

async function classifyWithGeminiVision(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
): Promise<ClassificationOutcome | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey || !metadata.image) return null;

  const boardList = boards.map((b) => b.name);
  const allowedBoardsPrompt = formatAllowedBoardsPrompt(catalog, boardList);
  const visionPick = await pickBoardWithGeminiVision(
    boards, metadata, url, apiKey, allowedBoardsPrompt, catalog,
  );
  if (!visionPick) return null;

  console.log('Classified with Gemini vision', { board: visionPick.board_name });
  const { result } = await buildBoardOnlyResult(
    boards, metadata, url, visionPick, boardList, catalog,
    () => generateCopyWithGemini(metadata, url, visionPick.board_name, apiKey),
  );
  return { source: 'gemini', result };
}

async function classifyLink(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  sourceApp: string,
  catalog: BoardCatalog,
): Promise<ClassificationOutcome> {
  const boardList = boards.map((b) => b.name);
  const groqKey = Deno.env.get('GROQ_API_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');

  // 1. Heuristics (primary)
  const heuristic = tryHeuristicBoard(metadata, url, boardList, catalog);
  if (heuristic?.confident && !isRejectableBoardName(heuristic.board_name)) {
    console.log('Classified with heuristics (primary)', { board: heuristic.board_name });
    return heuristicClassificationOutcome(boards, metadata, url, heuristic.board_name, catalog);
  }

  // 2. Groq — text classification (separate quota from Gemini)
  if (groqKey) {
    const groq = await classifyWithGroq(boards, metadata, url, catalog);
    if (groq) return groq;
    console.log('Groq could not classify — trying Gemini');
  }

  // 3. Gemini — text fallback, then vision for sparse social posts
  if (geminiKey && Deno.env.get('SKIP_GEMINI') !== 'true') {
    const geminiText = await classifyWithGeminiText(boards, metadata, url, catalog);
    if (geminiText) return geminiText;

    const needsVision = metadata.image && isSocialContentUrl(url) &&
      (isSparseMetadata(metadata, url) || shouldUseVision(metadata, url, null));
    if (needsVision) {
      const geminiVision = await classifyWithGeminiVision(boards, metadata, url, catalog);
      if (geminiVision) return geminiVision;
    }

    console.log('Gemini unavailable — using generic board fallback');
  }

  // 4. Safe generic board — AI unavailable; no topic heuristics (avoids false positives)
  return aiUnavailableFallbackOutcome(boards, metadata, url, catalog);
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
  const catalog = await fetchBoardCatalog(supabase);

  const cacheUrl = normalizeUrlForCache(url);
  const urlHash = await hashUrlForCache(cacheUrl);
  const serviceClient = createServiceSupabaseClient();

  let classificationOutcome: ClassificationOutcome;

  const cached = serviceClient ? await lookupClassificationCache(serviceClient, urlHash) : null;
  if (cached) {
    console.log('Classification cache hit', { board: cached.board_name, source: cached.source });
    classificationOutcome = {
      source: cached.source,
      result: {
        board_name: cached.board_name,
        title: cached.title,
        description: cached.description,
        is_new_board: false,
      },
    };
  } else {
    classificationOutcome = await classifyLink(boardList, metadata, url, sourceApp, catalog);
    if (serviceClient && shouldCacheClassification(classificationOutcome.result, metadata, url)) {
      await saveClassificationCache(serviceClient, urlHash, cacheUrl, classificationOutcome);
      console.log('Classification cached', { board: classificationOutcome.result.board_name });
    }
  }

  const classified = classificationOutcome.result;

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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const PLATFORM_NAMES = new Set([
  'instagram', 'youtube', 'tiktok', 'twitter', 'x', 'facebook', 'web',
  'spotify', 'linkedin', 'reddit', 'pinterest', 'whatsapp', 'snapchat',
]);

/** Hosts where links are usually shared content (video/post/pin), not e-commerce */
const SOCIAL_CONTENT_HOST =
  /(?:^|\.)instagram\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.(?:com|[\w.]+)|twitter\.com|x\.com|facebook\.com|linkedin\.com|reddit\.com|snapchat\.com|vimeo\.com|threads\.net|bsky\.app/i;

const PLATFORM_NAME_ALT = [...PLATFORM_NAMES].filter((n) => n !== 'web').join('|');
const PLATFORM_CONTENT_TYPES = 'photo|video|reel|post|pin|tweet|image|story|short|clip|live';

/** Boards that describe the platform, not the post topic */
const PLATFORM_GENERIC_BOARD_NAMES = new Set([
  'social media', 'social network', 'social networks', 'social networking',
  'redes sociales', 'red social', 'networking', 'content', 'posts', 'videos',
]);

function isPlatformGenericBoardName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (PLATFORM_GENERIC_BOARD_NAMES.has(lower)) return true;
  if (isGenericBoardName(name) || isGenericMediaBoard(name)) return true;
  return false;
}

/**
 * True when title/description carry a real post caption (any language).
 * False for platform names, login boilerplate, @handles only, author-only stubs.
 */
function hasTrustworthyCaption(metadata: LinkMetadata, url: string): boolean {
  const title = metadata.title.trim();
  const desc = metadata.description.trim();
  const combined = `${title} ${desc}`.trim();

  if (!combined) return false;
  if (isBoilerplateDescription(desc)) return false;
  if (isGenericShareTitle(title) || isPlatformShareStub(title) ||
    isPlatformChromeTitle(title) || isBarePlatformName(title)) {
    return false;
  }
  if (isPlatformShareStub(desc)) return false;
  if (title && desc && title.toLowerCase() === desc.toLowerCase() && title.length < 72) return false;
  if (/^@[\w.]+$/.test(title)) return false;
  if (desc.length < 50 && /^by\s+[\w\s.@]+$/i.test(desc)) return false;
  if (/^@?\w[\w.]+\s*\(@[\w.]+\)\s*$/.test(title) && desc.length < 50) return false;
  if (combined.length < 40) return false;

  return true;
}

/** Groq/Gemini text returned a platform-generic label instead of real topic */
function isGenericTextClassificationResult(result: ClassifyResult): boolean {
  if (isPlatformGenericBoardName(result.board_name)) return true;
  if (isPlatformBoardName(result.board_name)) return true;
  if (isCatchallBoardName(result.board_name)) return true;

  const title = result.title.trim();
  if (/^social\s+(media|network|post)/i.test(title)) return true;
  if (/^(social\s+)?(network|media|post|content|video|reel)s?$/i.test(title)) return true;
  if (isGenericShareTitle(title) || isBarePlatformName(title)) return true;

  const desc = result.description.trim();
  if (isBoilerplateDescription(desc)) return true;
  if (/social\s+(media|network|platform)/i.test(desc) && desc.length < 160) return true;

  return false;
}

/** CDN logos / OG placeholders — not the post image (vision would hallucinate from branding) */
function isPlatformBrandingImageUrl(imageUrl: string): boolean {
  const u = imageUrl.toLowerCase();
  if (/static\.cdninstagram\.com\/rsrc\.php/i.test(u)) return true;
  if (/\.cdninstagram\.com\/rsrc\.php/i.test(u)) return true;
  if (/fbcdn\.net\/rsrc\.php/i.test(u)) return true;
  if (/tiktokcdn\.com.*\/logo/i.test(u)) return true;
  return false;
}

function pickBestImage(candidates: (string | null | undefined)[]): string | null {
  for (const raw of candidates) {
    if (raw?.trim() && !isPlatformBrandingImageUrl(raw)) return raw.trim();
  }
  return null;
}

function hasUsableVisionImage(metadata: LinkMetadata): boolean {
  return Boolean(metadata.image && !isPlatformBrandingImageUrl(metadata.image));
}

function hasUnreliableSocialMetadata(metadata: LinkMetadata, url: string): boolean {
  if (!isSocialContentUrl(url)) return false;
  if (isYouTubeUrl(url) && hasTrustworthyCaption(metadata, url)) return false;
  return !hasTrustworthyCaption(metadata, url);
}

/** Instagram/TikTok etc. with login boilerplate or @handle only — text AI hallucinates */
function needsVisionForUntrustworthySocial(metadata: LinkMetadata, url: string): boolean {
  if (!hasUsableVisionImage(metadata) || !isSocialContentUrl(url)) return false;
  return hasUnreliableSocialMetadata(metadata, url);
}

/** After Groq/Gemini text: upgrade to vision when pick is generic OR metadata was useless */
function shouldUpgradeWithVision(
  metadata: LinkMetadata,
  url: string,
  result: ClassifyResult,
): boolean {
  if (!hasUsableVisionImage(metadata)) return false;
  if (needsVisionForUntrustworthySocial(metadata, url)) return true;
  return isGenericTextClassificationResult(result);
}

/** Text-only AI on sparse social metadata is unreliable — do not return when vision was required */
function shouldRejectTextOnlyAiOnSparseSocial(
  metadata: LinkMetadata,
  url: string,
): boolean {
  return hasUnreliableSocialMetadata(metadata, url);
}

async function maybeUpgradeWithVision(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  catalog: BoardCatalog,
  outcome: ClassificationOutcome,
): Promise<ClassificationOutcome | null> {
  if (!shouldUpgradeWithVision(metadata, url, outcome.result)) return null;

  const reason = needsVisionForUntrustworthySocial(metadata, url)
    ? 'untrustworthy caption (text AI unreliable)'
    : 'generic text classification';

  console.log(`Text AI needs vision — ${reason}`, {
    source: outcome.source,
    board: outcome.result.board_name,
    title: outcome.result.title.slice(0, 40),
  });

  return await classifyWithGeminiVision(boards, metadata, url, catalog);
}

function isSocialContentUrl(url: string): boolean {
  try {
    return SOCIAL_CONTENT_HOST.test(new URL(url).hostname);
  } catch {
    return SOCIAL_CONTENT_HOST.test(url);
  }
}

function isCommerceUrl(url: string): boolean {
  return /amazon\.|ebay\.|etsy\.|shopify\.com/i.test(url);
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

/** AI / fallback picks with no real topic — upgrade when metadata or copy signals something specific */
const CATCHALL_BOARD_NAMES = new Set([
  'ideas', 'inspiration', 'inspiración', 'inspiracion', 'general', 'other', 'misc', 'miscellaneous',
]);

function isCatchallBoardName(name: string): boolean {
  return CATCHALL_BOARD_NAMES.has(name.trim().toLowerCase());
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

/** YouTube links whose title looks like a song/video (Artist - Track, official video, etc.) */
function isYouTubeMusicCandidate(metadata: LinkMetadata, url: string): boolean {
  if (!isYouTubeUrl(url)) return false;
  const title = metadata.title.trim();
  if (!title || isPlatformChromeTitle(title)) return false;
  return isLikelyMediaTitle(title);
}

/** Genre/subject keywords in AI copy or metadata — maps to catalog board names */
const SUBJECT_KEYWORD_TO_BOARD: [RegExp, string][] = [
  [/\b(rock|grunge|alternative|punk|metal|grime)\b/i, 'Rock'],
  [/\b(hip[\s-]?hop|\brap\b|drill|trap)\b/i, 'Hip-Hop'],
  [/\b(techno|berghain|gabber|hardcore)\b/i, 'Techno'],
  [/\b(deep\s*house|tech\s*house|house\s*music|house\s*(mix|set))\b/i, 'House'],
  [/\b(jazz|bebop|blues)\b/i, 'Jazz'],
  [/\b(k[\s-]?pop)\b/i, 'K-Pop'],
  [/\b(reggaeton|dembow)\b/i, 'Reggaeton'],
  [/\b(afrobeats?|afrobeat)\b/i, 'Afrobeats'],
  [/\b(reggae|dancehall)\b/i, 'Reggae'],
  [/\b(electronic|edm|dubstep|trance)\b/i, 'Electronic'],
  [/\b(classical|symphony|orchestra)\b/i, 'Classical'],
  [/\b(country\s*music|country\s*song)\b/i, 'Country'],
  [/\b(salsa|bachata|merengue)\b/i, 'Latin'],
  [/\b(pop\s*music|synthpop|pop\s*song)\b/i, 'Pop'],
  [/\b(football|soccer|premier\s*league|champions\s*league)\b/i, 'Football'],
  [/\b(basketball|nba)\b/i, 'Basketball'],
  [/\b(recipe|cooking|baking)\b/i, 'Recipes'],
  [/\b(workout|crossfit|gym|fitness)\b/i, 'Fitness'],
  [/\b(fashion|outfit|streetwear)\b/i, 'Fashion'],
  [/\b(tattoos?|tattooing|inked|body\s*art)\b|tattoo|刺青|纹身|tatuaje/i, 'Tattoo'],
];

function inferBoardFromText(
  text: string,
  userBoards: string[],
  catalog: BoardCatalog,
): string | null {
  const trimmed = text.trim();
  if (!trimmed || isBoilerplateDescription(trimmed)) return null;

  // Specific genres/topics before umbrella rules (e.g. "Rock Music" → Rock, not Music)
  for (const [pattern, board] of SUBJECT_KEYWORD_TO_BOARD) {
    if (pattern.test(trimmed)) {
      return pickExistingOrCatalog(userBoards, board, catalog);
    }
  }

  for (const rule of GENERIC_TOPIC_RULES) {
    if (rule.pattern.test(trimmed)) {
      return pickBilingualBoard(userBoards, rule.en, rule.es, catalog);
    }
  }

  return null;
}

function upgradeCatchallBoard(
  board: string,
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
  extraText = '',
): string {
  if (!isCatchallBoardName(board)) return board;

  const granular = inferGranularBoard(metadata, url);
  if (granular && !isRejectableBoardName(granular)) {
    const upgraded = pickExistingOrCatalog(userBoards, granular, catalog);
    logCatchallUpgrade(board, upgraded, 'granular-metadata', metadata);
    return upgraded;
  }

  const topic = inferTopicBoard(metadata, url, userBoards, catalog);
  if (topic && !isCatchableTopicForCatchall(topic, board)) {
    const upgraded = pickExistingOrCatalog(userBoards, topic, catalog);
    logCatchallUpgrade(board, upgraded, 'topic-keywords', metadata);
    return upgraded;
  }

  if (isYouTubeMusicCandidate(metadata, url)) {
    const upgraded = pickMusicBoardFromMetadata(metadata, userBoards, catalog);
    logCatchallUpgrade(board, upgraded, 'youtube-music-title', metadata);
    return upgraded;
  }

  const fromText = inferBoardFromText(
    `${metadata.title} ${extraText}`.trim(),
    userBoards,
    catalog,
  );
  if (fromText && !isCatchallBoardName(fromText)) {
    logCatchallUpgrade(board, fromText, 'text-keywords', metadata);
    return fromText;
  }

  return board;
}

function logCatchallUpgrade(from: string, to: string, reason: string, metadata: LinkMetadata): void {
  if (from.toLowerCase() === to.toLowerCase()) return;
  console.log('Catchall board upgraded', {
    from,
    to,
    reason,
    title: metadata.title.slice(0, 80),
  });
}

/** After AI writes title + description, board must match — fixes Ideas + "Rock Music" mismatches */
function reconcileBoardWithClassification(
  result: ClassifyResult,
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): ClassifyResult {
  const copyText = `${result.title} ${result.description}`.trim();

  // Tier 1 → 2 resolution (user boards, then catalog) before catch-all upgrades
  if (isCatchallBoardName(result.board_name)) {
    const tiered = resolveBoardTiered(metadata, url, userBoards, catalog, copyText);
    if (tiered) {
      logCatchallUpgrade(
        result.board_name,
        tiered.board_name,
        tiered.tier === 'user' ? 'tier-1-user' : 'tier-2-catalog',
        metadata,
      );
      result.board_name = tiered.board_name;
      result.is_new_board = tiered.tier === 'catalog' &&
        !userBoards.some((b) => b.toLowerCase() === tiered.board_name.toLowerCase());
      return result;
    }
  }

  let board = upgradeCatchallBoard(result.board_name, metadata, url, userBoards, catalog, copyText);

  const fromCopy = inferBoardFromText(copyText, userBoards, catalog);
  if (fromCopy) {
    const currentLower = board.trim().toLowerCase();
    const copyLower = fromCopy.toLowerCase();
    if (currentLower !== copyLower) {
      const shouldUseCopy =
        isCatchallBoardName(board) ||
        isBroadBoardName(board) ||
        (isMusicRelatedBoardName(board) && isMusicRelatedBoardName(fromCopy));

      if (shouldUseCopy) {
        logCatchallUpgrade(board, fromCopy, 'ai-copy-topic', metadata);
        board = fromCopy;
      }
    }
  }

  if (board !== result.board_name) {
    result.board_name = board;
    result.is_new_board = !userBoards.some((b) => b.toLowerCase() === board.toLowerCase());
  }

  return result;
}

function isCatchableTopicForCatchall(topic: string, catchall: string): boolean {
  return topic.toLowerCase() === catchall.toLowerCase();
}

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
    'Football', 'Basketball', 'Tennis', 'Hip-Hop', 'Techno', 'Jazz', 'Rock', 'Pop', 'Music', 'Fashion', 'Shopping', 'Home',
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

function pickCatalogBoard(name: string, catalog: BoardCatalog): string | null {
  return findInCatalog(name, catalog) ?? null;
}

/** Tier 1 — topic keywords that match a board the user already has */
function matchUserBoardTopic(text: string, userBoards: string[]): string | null {
  if (!text.trim() || isAmbiguousOfTitle(text)) return null;
  for (const rule of GENERIC_TOPIC_RULES) {
    if (!rule.pattern.test(text)) continue;
    const user = userBoards.find((b) => b.toLowerCase() === rule.en.toLowerCase()) ??
      userBoards.find((b) => b.toLowerCase() === rule.es.toLowerCase());
    if (user) return user;
  }
  return null;
}

/** Tier 2 — topic keywords mapped to board_catalog only (user boards already ruled out) */
function matchCatalogTopic(text: string, catalog: BoardCatalog): string | null {
  if (!text.trim() || isBoilerplateDescription(text)) return null;

  for (const [pattern, board] of SUBJECT_KEYWORD_TO_BOARD) {
    if (pattern.test(text)) {
      return pickCatalogBoard(board, catalog);
    }
  }

  for (const rule of GENERIC_TOPIC_RULES) {
    if (!rule.pattern.test(text)) continue;
    const catalogBoard = pickCatalogBoard(rule.en, catalog) ?? pickCatalogBoard(rule.es, catalog);
    if (catalogBoard) return catalogBoard;
  }

  return null;
}

type TieredBoardMatch = {
  board_name: string;
  tier: 'user' | 'catalog';
};

/**
 * Deterministic board resolution — always in order:
 * 1. User boards  2. board_catalog  (never Ideas here)
 */
function resolveBoardTiered(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
  extraText = '',
): TieredBoardMatch | null {
  const title = metadata.title.trim();
  const desc = metadata.description.trim();
  const fullText = `${title} ${desc} ${extraText}`.trim();

  // —— Tier 1: user boards ——
  for (const board of userBoards) {
    if (isPlatformBoardName(board)) continue;
    if (titleMentionsBoard(title, board) &&
        !isIncidentalUserBoardMatch(metadata, url, board, userBoards, catalog)) {
      return { board_name: board, tier: 'user' };
    }
  }

  const userFromTitle = matchUserBoardTopic(title, userBoards);
  if (userFromTitle) return { board_name: userFromTitle, tier: 'user' };

  if (title.length < 20 && desc && !isBoilerplateDescription(desc)) {
    const userFromDesc = matchUserBoardTopic(desc, userBoards);
    if (userFromDesc) return { board_name: userFromDesc, tier: 'user' };
  }

  // —— Tier 2: board_catalog ——
  const catalogFromText = matchCatalogTopic(fullText, catalog);
  if (catalogFromText) {
    return { board_name: catalogFromText, tier: 'catalog' };
  }

  const granular = inferGranularBoard(metadata, url);
  if (granular) {
    const catalogBoard = pickCatalogBoard(granular, catalog);
    if (catalogBoard) return { board_name: catalogBoard, tier: 'catalog' };
  }

  if (isYouTubeMusicCandidate(metadata, url)) {
    const music = resolveMusicCatalogBoard(userBoards, catalog);
    return { board_name: music, tier: 'catalog' };
  }

  return null;
}

function formatAllowedBoardsPrompt(catalog: BoardCatalog, userBoards: string[]): string {
  const preferred = userBoards.filter((board) => {
    if (isPlatformBoardName(board) || isGenericBoardName(board)) return false;
    return true;
  });

  const preferredBlock = preferred.length > 0
    ? `STEP 1 — USER BOARDS (check FIRST; pick only if the link topic genuinely fits):\n${preferred.join(', ')}\n\n`
    : 'STEP 1 — USER BOARDS: (none yet — skip to catalog)\n\n';

  const extra = preferred.filter(
    (board) => !catalog.names.some((name) => name.toLowerCase() === board.toLowerCase()),
  );
  const catalogBlock = extra.length > 0
    ? `${catalog.groupsText}\n(Also allowed: ${extra.join(', ')})`
    : catalog.groupsText;

  return `${preferredBlock}STEP 2 — CATALOG BOARDS (if no user board fits, pick the best catalog name — e.g. Rock, Music, Pop, Recipes):\n${catalogBlock}\n\nSTEP 3 — NEVER pick Ideas, Inspiration, or other catch-alls when any catalog board fits.`;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const GENERIC_SHARE_TITLES = /^(instagram share|shared from instagram|youtube|tiktok|shared link|web page)$/i;

/** OS share sheet stubs — "Compartido en Instagram", "Shared on TikTok", etc. */
function isPlatformShareStub(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (new RegExp(
    `^(?:shared\\s+(?:on|from)|compartido\\s+en|compartir\\s+(?:en|desde)|publicado\\s+en|partag[eé]\\s+(?:sur|de)|condiviso\\s+su|geteilt\\s+(?:auf|in)|compartilhado\\s+(?:no|em)|shared\\s+via)\\s+(?:en\\s+|on\\s+|from\\s+)?(${PLATFORM_NAME_ALT})\\s*$`,
    'i',
  ).test(trimmed)) {
    return true;
  }
  if (new RegExp(`^(${PLATFORM_NAME_ALT})\\s+(?:share|compartido|partage|condivisione)$`, 'i').test(trimmed)) {
    return true;
  }
  return false;
}

function isUsableMetadataTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (isGenericShareTitle(trimmed)) return false;
  if (isPlatformShareStub(trimmed)) return false;
  if (isPlatformChromeTitle(trimmed)) return false;
  if (isBarePlatformName(trimmed)) return false;
  return true;
}

const MAX_BOOKMARK_TITLE = 40;
const MAX_BOOKMARK_DESC = 500;

/** All user-facing bookmark copy is written in English */
const AI_COPY_LANGUAGE_RULE =
  'Write title and description in English only. Translate or summarize non-English source text — do not copy foreign-language captions verbatim.';

/** Generic copy rules — no concrete examples (models anchor on few-shot samples and hallucinate) */
const COPY_TITLE_RULES = `TITLE RULES:
- Format: "{Topic}: {Subject}" — Topic must match board; Subject MUST come ONLY from page title/description above
- Max ${MAX_BOOKMARK_TITLE} characters
- Never invent names, artists, dishes, teams, or subjects absent from the metadata
- Never copy wording from these instructions — only from the actual page content
- Use genre/content labels (Freestyle, Track, Recipe, Match highlights, Tattoo, etc.) ONLY when metadata confirms that type AND board matches`;

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
  if (isPlatformShareStub(trimmed)) return true;
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
  let bestScore = -1;
  for (const raw of candidates) {
    const desc = (raw ?? '').trim();
    if (!desc) continue;
    const score = isBoilerplateDescription(desc) ? desc.length - 10_000 : desc.length;
    if (score > bestScore) {
      bestScore = score;
      best = desc;
    }
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

const CACHE_VERSION = 36;
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
  if (isGenericTextClassificationResult(result)) return false;
  if (hasUnreliableSocialMetadata(metadata, url)) return false;
  if (needsVisionForUntrustworthySocial(metadata, url)) return false;
  if (isPlatformGenericBoardName(result.board_name)) return false;
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
  if (!hasUsableVisionImage(metadata)) return false;
  if (!isSparseMetadata(metadata, url)) return false;
  if (!isSocialPostUrl(url)) return false;
  return !boardPick || isGenericBoardName(boardPick.board_name);
}

/** Genre boards when the catalog has no umbrella "Music" entry */
const MUSIC_CATALOG_FALLBACK_ORDER = [
  'Rock', 'Pop', 'Hip-Hop', 'Jazz', 'Electronic', 'House', 'Techno', 'R&B', 'Classical', 'Latin', 'Folk',
];

function resolveMusicCatalogBoard(userBoards: string[], catalog: BoardCatalog): string {
  for (const genre of MUSIC_CATALOG_FALLBACK_ORDER) {
    const existing = userBoards.find((b) => b.toLowerCase() === genre.toLowerCase());
    if (existing) return existing;
    const inCatalog = findInCatalog(genre, catalog);
    if (inCatalog) return inCatalog;
  }
  return findInCatalog('Ideas', catalog) ?? catalog.names[0] ?? 'Rock';
}

function pickMusicBoardFromMetadata(
  metadata: LinkMetadata,
  userBoards: string[],
  catalog: BoardCatalog,
): string {
  const title = metadata.title.trim();
  for (const [pattern, board] of SUBJECT_KEYWORD_TO_BOARD) {
    if (pattern.test(title)) {
      return pickExistingOrCatalog(userBoards, board, catalog);
    }
  }
  return resolveMusicCatalogBoard(userBoards, catalog);
}

function pickExistingOrCatalog(userBoards: string[], catalogName: string, catalog: BoardCatalog): string {
  const existing = userBoards.find((b) => b.toLowerCase() === catalogName.toLowerCase());
  if (existing) return existing;
  const inCatalog = findInCatalog(catalogName, catalog);
  if (inCatalog) return inCatalog;

  const lower = catalogName.trim().toLowerCase();
  if (lower === 'music' || lower === 'música' || lower === 'musica') {
    return resolveMusicCatalogBoard(userBoards, catalog);
  }

  // Never fall back to Shopping for unknown topic boards
  const ideas = findInCatalog('Ideas', catalog);
  if (ideas) return ideas;
  const safe = catalog.names.find((n) => !['shopping', 'home', 'fashion'].includes(n.toLowerCase()));
  return safe ?? catalogName;
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
  return /\b(subscribe|like and subscribe|share your videos|upload your videos|upload original content|watch full video|enjoy the videos|share it all with friends|create an account or log in|log in to|sign up to|share what you.re into|see instagram photos|see photos and videos|watch on tiktok|download the app|get the app|inicia sesi[oó]n|crea una cuenta|reg[ií]strate|youtube\.com|tiktok\.com|instagram\.com)\b/i.test(d);
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
  'medicine', 'medicina', 'science', 'history', 'nature', 'dream', 'gold', 'silver',
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

/** Song/video titles: "Artist - Track", official video, lyrics, etc. */
const MEDIA_TITLE_MARKERS =
  /\b(official\s*(video|audio|mv|lyric|visualizer)|music\s*video|\bmv\b|lyrics?|audio\s*only|remix|live\s*(session|performance|at|from)|vevo|ft\.|feat\.|featuring)\b/i;

function isLikelyMediaTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (MEDIA_TITLE_MARKERS.test(trimmed)) return true;
  return /^[^–\-—|]{2,}\s*[-–—|]\s*[^–\-—|]{2,}/.test(trimmed);
}

function isMusicRelatedBoardName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (MUSIC_BOARDS.has(lower)) return true;
  return /\b(music|m[uú]sica|song|cancion|rock|pop|jazz|hip[\s-]?hop|rap|band|concert|album|playlist)\b/i.test(lower);
}

/**
 * User board picked only because its name appears in the title (song name, brand, etc.)
 * — not because the link topic matches the board subject.
 */
function isIncidentalUserBoardMatch(
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  userBoards: string[],
  catalog: BoardCatalog,
): boolean {
  const normalizedBoard = boardName.trim();
  if (!userBoards.some((b) => b.toLowerCase() === normalizedBoard.toLowerCase())) {
    return false;
  }

  const title = metadata.title.trim();
  if (!title || !titleMentionsBoard(title, normalizedBoard)) {
    return false;
  }

  const granular = inferGranularBoard(metadata, url);
  if (granular && granular.toLowerCase() !== normalizedBoard.toLowerCase()) {
    return true;
  }

  const topicHit = matchGenericTopic(title, userBoards, catalog);
  if (topicHit && topicHit.toLowerCase() !== normalizedBoard.toLowerCase()) {
    return true;
  }

  if (isLikelyMediaTitle(title) && !isMusicRelatedBoardName(normalizedBoard)) {
    return true;
  }

  if (!normalizedBoard.includes(' ')) {
    const titleWords = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (titleWords.length >= 2) {
      const desc = metadata.description.trim();
      const descReinforces = desc.length >= 40 &&
        !isBoilerplateDescription(desc) &&
        (titleMentionsBoard(desc, normalizedBoard) ||
          matchGenericTopic(desc, userBoards, catalog)?.toLowerCase() === normalizedBoard.toLowerCase());
      if (!descReinforces) return true;
    }
  }

  return false;
}

function resolveBoardAfterWeakUserMatch(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): string {
  const granular = inferGranularBoard(metadata, url);
  if (granular && !isRejectableBoardName(granular)) {
    return pickExistingOrCatalog(userBoards, granular, catalog);
  }

  const topic = inferTopicBoard(metadata, url, userBoards, catalog);
  if (topic && !isRejectableBoardName(topic)) {
    return pickExistingOrCatalog(userBoards, topic, catalog);
  }

  if (isYouTubeMusicCandidate(metadata, url)) {
    return pickMusicBoardFromMetadata(metadata, userBoards, catalog);
  }

  return pickExistingOrCatalog(userBoards, 'Ideas', catalog);
}

function logClassifyMetadata(metadata: LinkMetadata, url: string, userBoards: string[], provider: string): void {
  console.log(`${provider}: metadata`, {
    url: url.slice(0, 120),
    title: metadata.title.slice(0, 100),
    descLen: metadata.description.length,
    descPreview: metadata.description.slice(0, 120) || '(none)',
    userBoards: userBoards.slice(0, 15),
  });
}

function inferTopicBoard(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): string | null {
  const title = metadata.title.trim();
  if (title) {
    const fromTitle = matchGenericTopic(title, userBoards, catalog);
    if (fromTitle) return fromTitle;

    if (isYouTubeMusicCandidate(metadata, url)) {
      const granular = inferGranularBoard(metadata, url);
      if (granular && !isRejectableBoardName(granular)) {
        return pickExistingOrCatalog(userBoards, granular, catalog);
      }
      return pickMusicBoardFromMetadata(metadata, userBoards, catalog);
    }

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
  for (const board of userBoards) {
    if (isPlatformBoardName(board)) continue;
    if (titleMentionsBoard(metadata.title, board) &&
        !isIncidentalUserBoardMatch(metadata, url, board, userBoards, catalog)) {
      return board;
    }
  }

  const specific = inferGranularBoard(metadata, url);
  if (specific && !isRejectableBoardName(specific)) {
    return pickExistingOrCatalog(userBoards, specific, catalog);
  }

  const topic = inferTopicBoard(metadata, url, userBoards, catalog);
  if (topic && !isRejectableBoardName(topic)) return topic;

  if (isYouTubeMusicCandidate(metadata, url)) {
    return pickMusicBoardFromMetadata(metadata, userBoards, catalog);
  }

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
  console.log('Classified catch-all (AI + heuristics exhausted)', { board: boardName });
  return heuristicClassificationOutcome(boards, metadata, url, boardName, catalog);
}

/** Keyword heuristics when AI is unavailable or exhausted */
function tryHeuristicBoard(
  metadata: LinkMetadata,
  url: string,
  userBoards: string[],
  catalog: BoardCatalog,
): { confident: boolean; board_name: string } | null {
  // "X of Y" titles and entity-only names → not confident; AI + user boards decide
  if (isAmbiguousOfTitle(metadata.title.trim())) {
    return null;
  }

  if (isYouTubeMusicCandidate(metadata, url)) {
    const granular = inferGranularBoard(metadata, url);
    const boardName = granular && !isRejectableBoardName(granular)
      ? pickExistingOrCatalog(userBoards, granular, catalog)
      : pickMusicBoardFromMetadata(metadata, userBoards, catalog);
    return { confident: true, board_name: boardName };
  }

  const specific = inferGranularBoard(metadata, url);
  if (specific && !isRejectableBoardName(specific)) {
    return { confident: true, board_name: pickExistingOrCatalog(userBoards, specific, catalog) };
  }

  const topic = inferTopicBoard(metadata, url, userBoards, catalog);
  if (topic && !isRejectableBoardName(topic)) {
    return { confident: true, board_name: topic };
  }

  return null;
}

/** Plain title + description from metadata — no genre/board prefixes (heuristics path) */
function plainCopyFromMetadata(metadata: LinkMetadata): { title: string; description: string } {
  const title = youtubeVideoTitle(metadata.title).trim().slice(0, MAX_BOOKMARK_TITLE);
  const description = summarizeDescription(metadata.description, MAX_BOOKMARK_DESC);
  return { title, description };
}

async function classifyWithDeterministicBoard(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  catalog: BoardCatalog,
  groqEnabled: boolean,
  geminiEnabled: boolean,
): Promise<ClassificationOutcome> {
  const boardList = boards.map((b) => b.name);
  const existing = boards.find((b) => b.name.toLowerCase() === boardName.toLowerCase());
  const boardPick = {
    board_name: existing?.name ?? boardName,
    is_new_board: !existing,
  };

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (groqEnabled && groqKey) {
    const { result, copyFrom } = await buildBoardOnlyResult(
      boards, metadata, url, boardPick, boardList, catalog,
      () => generateCopyWithGroq(metadata, url, boardPick.board_name, groqKey),
    );
    console.log('Deterministic board + Groq copy', { board: boardPick.board_name, copyFrom });
    return { source: 'groq', result };
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiEnabled && geminiKey) {
    const { result, copyFrom } = await buildBoardOnlyResult(
      boards, metadata, url, boardPick, boardList, catalog,
      () => generateCopyWithGemini(metadata, url, boardPick.board_name, geminiKey),
    );
    console.log('Deterministic board + Gemini copy', { board: boardPick.board_name, copyFrom });
    return { source: 'gemini', result };
  }

  return heuristicClassificationOutcome(boards, metadata, url, boardPick.board_name, catalog);
}

function heuristicClassificationOutcome(
  boards: Board[],
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  catalog: BoardCatalog,
): ClassificationOutcome {
  const boardList = boards.map((b) => b.name);
  const plain = plainCopyFromMetadata(metadata);
  return {
    source: 'heuristic',
    result: polishClassifyResult(
      {
        board_name: boardName,
        title: plain.title,
        description: plain.description,
        is_new_board: !boards.some((b) => b.name.toLowerCase() === boardName.toLowerCase()),
      },
      metadata,
      url,
      boardList,
      catalog,
      { plainCopy: true },
    ),
  };
}

function cleanYouTubeUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function extractInstagramMediaRef(url: string): { kind: 'p' | 'reel' | 'tv'; id: string } | null {
  const match = url.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return { kind: match[1].toLowerCase() as 'p' | 'reel' | 'tv', id: match[2] };
}

function parseInstagramEmbedCaption(html: string): string | null {
  const anchor = html.indexOf('edge_media_to_caption');
  if (anchor < 0) return null;

  const markers = ['\\"text\\":\\"', '"text":"'];
  for (const marker of markers) {
    const start = html.indexOf(marker, anchor);
    if (start < 0) continue;

    let i = start + marker.length;
    let raw = '';
    while (i < html.length) {
      const ch = html[i];
      if (ch === '\\') {
        const next = html[i + 1];
        if (next === '"') break;
        raw += ch + (next ?? '');
        i += next ? 2 : 1;
        continue;
      }
      if (ch === '"' && marker === '"text":"') break;
      raw += ch;
      i += 1;
    }

    if (!raw) continue;

    const normalized = raw.replace(/\\\\/g, '\\');
    for (const candidate of [normalized, raw]) {
      try {
        const parsed = JSON.parse(`"${candidate}"`).trim();
        if (parsed.length >= 8) return parsed;
      } catch {
        // try next normalization
      }
    }
  }

  return null;
}

function unescapeInstagramJsonUrl(raw: string): string {
  return raw
    .replace(/\\\\\//g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseInstagramDisplayUrl(html: string): string | null {
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const anchor = html.indexOf('display_url', searchFrom);
    if (anchor < 0) break;
    searchFrom = anchor + 11;

    const slice = html.slice(anchor, anchor + 800);
    const markers = ['\\"display_url\\":\\"', 'display_url\\":\\"', '"display_url":"'];
    for (const marker of markers) {
      const rel = slice.indexOf(marker);
      if (rel < 0) continue;

      let i = anchor + rel + marker.length;
      let raw = '';
      while (i < html.length) {
        const ch = html[i];
        if (ch === '\\') {
          const next = html[i + 1];
          if (next === '"') break;
          raw += ch + (next ?? '');
          i += next ? 2 : 1;
          continue;
        }
        if (ch === '"') break;
        raw += ch;
        i += 1;
      }

      if (!raw.includes('instagram') && !raw.includes('scontent')) continue;
      const url = unescapeInstagramJsonUrl(raw);
      if (url.startsWith('http') && !isPlatformBrandingImageUrl(url)) return url;
    }
  }
  return null;
}

function parseInstagramEmbedImage(html: string): string | null {
  const display = parseInstagramDisplayUrl(html);
  if (display) return display;

  const normalized = html.replace(/\\\/\//g, 'https://').replace(/\\\//g, '/');
  const urls = [
    ...html.matchAll(/https:\/\/scontent[^"'\\s<>]+\.(?:jpg|jpeg|webp)/gi),
    ...normalized.matchAll(/https:\/\/scontent[^"'\\s<>]+\.(?:jpg|jpeg|webp)/gi),
  ].map((m) => m[0]);

  const unique = [...new Set(urls)];
  const postImages = unique.filter(
    (u) => /t51\.(2885-15|82787-15)/.test(u) && !isPlatformBrandingImageUrl(u),
  );
  if (postImages.length > 0) return postImages[0];

  return unique.find((u) => !/-19\//.test(u) && !isPlatformBrandingImageUrl(u)) ?? null;
}

function summarizeInstagramCaptionAsTitle(caption: string): string {
  const line = caption.split('\n').map((l) => l.trim()).find((l) => l.length >= 3 && !/^#/.test(l));
  const first = line ?? caption.split('\n')[0]?.trim() ?? caption;
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

async function fetchInstagramEmbedMetadata(url: string): Promise<Partial<LinkMetadata>> {
  const ref = extractInstagramMediaRef(url);
  if (!ref) return {};

  const embedUrls = [
    `https://www.instagram.com/${ref.kind}/${ref.id}/embed/`,
    `https://www.instagram.com/p/${ref.id}/embed/`,
    `https://www.instagram.com/${ref.kind}/${ref.id}/embed/captioned/`,
  ];

  let lastError = 'no embed response';

  for (const embedUrl of [...new Set(embedUrls)]) {
    for (const userAgent of [MOBILE_UA, BROWSER_UA]) {
      try {
        const res = await fetch(embedUrl, {
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
            Referer: 'https://www.instagram.com/',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }

        const html = (await res.text()).slice(0, 500_000);
        const caption = parseInstagramEmbedCaption(html);
        const image = parseInstagramEmbedImage(html);
        if (!caption && !image) {
          lastError = 'embed HTML without caption/image';
          continue;
        }

        console.log('Instagram embed metadata', {
          embedUrl,
          captionLen: caption?.length ?? 0,
          hasImage: Boolean(image),
        });

        return {
          title: caption ? summarizeInstagramCaptionAsTitle(caption) : undefined,
          description: caption ?? undefined,
          image: image ?? undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  console.warn('Instagram embed fetch failed', { url: url.slice(0, 120), lastError });
  return {};
}

function mergeSocialMetadata(
  metadata: LinkMetadata,
  url: string,
  shareTitle: string,
  embed: Partial<LinkMetadata>,
): LinkMetadata {
  const shareCaption = isGenericShareTitle(shareTitle) ? '' : shareTitle.trim();

  return sanitizeMetadata({
    title: pickBestTitle([shareCaption, embed.title, metadata.title], url) ?? metadata.title,
    description: pickBestDescription([shareCaption, embed.description, metadata.description]),
    image: pickBestImage([embed.image, metadata.image]),
  });
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
      image: data.data.image?.url ?? null,
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
  const image = pickBestImage([noembed.image, oembed.image, microlink.image]);

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
  const shareCaption = isGenericShareTitle(shareTitle) ? '' : shareTitle.trim();
  const fallbackTitle = shareCaption || fetchUrl;
  const youtubeId = extractYouTubeVideoId(fetchUrl);
  const youtubeThumb = youtubeId ? youtubeThumbnail(youtubeId) : null;

  const instagramEmbed = /instagram\.com/i.test(fetchUrl)
    ? await fetchInstagramEmbedMetadata(fetchUrl)
    : {};

  if (/instagram\.com/i.test(fetchUrl)) {
    console.log('Instagram metadata sources', {
      url: fetchUrl.slice(0, 100),
      embedCaptionLen: instagramEmbed.description?.length ?? 0,
      hasEmbedImage: Boolean(instagramEmbed.image),
      shareTitle: shareCaption.slice(0, 60) || '(none)',
    });
  }

  const external = await fetchExternalMetadata(fetchUrl);

  const externalTitle = external.title ? cleanPageTitle(external.title, fetchUrl) : '';
  const hasEmbedCaption = Boolean(instagramEmbed.description || instagramEmbed.title);
  if ((isUsableMetadataTitle(externalTitle) || hasEmbedCaption) && (externalTitle || hasEmbedCaption)) {
    const oembed = await fetchOEmbed(fetchUrl);
    return mergeSocialMetadata(
      {
        title: pickBestTitle([shareCaption, instagramEmbed.title, externalTitle, oembed.title], fetchUrl) ?? externalTitle,
        description: summarizeDescription(
          pickBestDescription([shareCaption, instagramEmbed.description, external.description, oembed.description]),
        ),
        image: pickBestImage([instagramEmbed.image, external.image, oembed.image, youtubeThumb]),
      },
      fetchUrl,
      shareTitle,
      instagramEmbed,
    );
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
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
        [shareCaption, instagramEmbed.title, playerData.title, oembed.title, ogTitle, external.title, fallbackTitle],
        fetchUrl,
      ) ?? fallbackTitle;
      const title = cleanPageTitle(rawTitle, fetchUrl);
      const description = summarizeDescription(
        pickBestDescription([
          shareCaption,
          instagramEmbed.description,
          playerData.description,
          oembed.description,
          ogDesc,
          external.description,
        ]),
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

      return mergeSocialMetadata(
        {
          title,
          description,
          image: pickBestImage([instagramEmbed.image, external.image, oembed.image, ogImage, youtubeThumb]),
        },
        fetchUrl,
        shareTitle,
        instagramEmbed,
      );
    }
  } catch (error) {
    console.warn('Metadata HTML fetch skipped', error instanceof Error ? error.name : error);
  }

  if (external.title) {
    return mergeSocialMetadata(
      {
        title: cleanPageTitle(external.title, fetchUrl),
        description: summarizeDescription(external.description ?? ''),
        image: pickBestImage([instagramEmbed.image, external.image, youtubeThumb]),
      },
      fetchUrl,
      shareTitle,
      instagramEmbed,
    );
  }

  const oembed = await fetchOEmbed(fetchUrl);
  return mergeSocialMetadata(
    {
      title: cleanPageTitle(pickBestTitle([shareCaption, instagramEmbed.title, oembed.title], fetchUrl) ?? fallbackTitle, fetchUrl),
      description: oembed.description ?? '',
      image: pickBestImage([instagramEmbed.image, oembed.image, youtubeThumb]),
    },
    fetchUrl,
    shareTitle,
    instagramEmbed,
  );
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

  if (isYouTubeMusicCandidate(metadata, url)) return 'Music';

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
  const validated = validateBoardChoice(refined, metadata, url, existingBoards, catalog);
  return upgradeCatchallBoard(validated, metadata, url, existingBoards, catalog);
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

  if (
    (boardLower === 'shopping' || boardLower === 'fashion' || boardLower === 'home') &&
    (isYouTubeMusicCandidate(metadata, url) || (boardLower === 'shopping' && !isCommerceUrl(url)))
  ) {
    return pickMusicBoardFromMetadata(metadata, existingBoards, catalog);
  }

  if (boardLower === 'art' && /tattoo|刺青|纹身|tatuaje/i.test(text)) {
    return pickExistingOrCatalog(existingBoards, 'Tattoo', catalog);
  }

  const userMatch = existingBoards.find((b) => b.toLowerCase() === boardLower);
  if (userMatch && isIncidentalUserBoardMatch(metadata, url, userMatch, existingBoards, catalog)) {
    console.log('Incidental user board match rejected', {
      board: userMatch,
      title: metadata.title.slice(0, 80),
    });
    return resolveBoardAfterWeakUserMatch(metadata, url, existingBoards, catalog);
  }
  if (userMatch) return userMatch;

  if (isRejectableBoardName(board)) {
    const refined = inferGranularBoard(metadata, url);
    if (refined && !isRejectableBoardName(refined)) {
      return pickExistingOrCatalog(existingBoards, refined, catalog);
    }
    const topic = inferTopicBoard(metadata, url, existingBoards, catalog);
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

  return upgradeCatchallBoard(board, metadata, url, existingBoards, catalog);
}

function isPlatformChromeTitle(title: string): boolean {
  if (new RegExp(`[•·]\\s*(${PLATFORM_NAME_ALT})\\s+(${PLATFORM_CONTENT_TYPES})`, 'i').test(title)) {
    return true;
  }
  if (new RegExp(`\\bon\\s+(${PLATFORM_NAME_ALT})\\b`, 'i').test(title)) return true;
  if (new RegExp(`^(${PLATFORM_CONTENT_TYPES}|shared link|web page)$`, 'i').test(title.trim())) return true;
  return false;
}

function isSparseMetadata(metadata: LinkMetadata, url: string): boolean {
  if (!hasTrustworthyCaption(metadata, url)) return true;

  const combined = `${metadata.title.trim()} ${metadata.description.trim()}`.trim();
  if (metadata.image && combined.length < 90) return true;

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
  if (!hasTrustworthyCaption(metadata, url) && isPlatformGenericBoardName(rawBoard)) {
    console.log(`${provider}: platform-generic board rejected (untrustworthy caption)`, { board: rawBoard });
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
    const label = boardName?.trim() || 'Post';
    return `${label}: ${raw}`.slice(0, MAX_BOOKMARK_TITLE);
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

  if (
    (board === 'fashion' || board === 'shopping' || board === 'home') &&
    !isYouTubeMusicCandidate(metadata, url)
  ) {
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

  if (board === 'tattoo') {
    const text = `${metadata.title}\n${metadata.description}`;
    const enLine = metadata.description.split('\n').map((l) => l.trim())
      .find((l) => /^[a-zA-Z0-9][a-zA-Z0-9\s\-']+$/.test(l) && l.length >= 4);
    if (enLine) return `Tattoo: ${enLine}`.slice(0, MAX_BOOKMARK_TITLE);
    if (/tiger|chrysanthemum/i.test(text)) return 'Tattoo: Tiger chrysanthemum';
    if (/tattoo|刺青|纹身/i.test(text)) return 'Tattoo: Traditional ink work';
    return 'Tattoo art';
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
  options: { plainCopy?: boolean } = {},
): ClassifyResult {
  result.board_name = refineBoardName(result.board_name, metadata, url, existingBoards, catalog);

  if (options.plainCopy) {
    const plain = plainCopyFromMetadata(metadata);
    result.title = plain.title;
    result.description = sanitizeBookmarkDescription(plain.description) || plain.description;
    return reconcileBoardWithClassification(result, metadata, url, existingBoards, catalog);
  }

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

  const upgraded = reconcileBoardWithClassification(
    result,
    metadata,
    url,
    existingBoards,
    catalog,
  );
  return upgraded;
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

const AI_BOARD_RULES = `CLASSIFICATION ORDER (follow strictly):
1. USER BOARDS — pick only if the link topic genuinely fits one the user already has
2. CATALOG BOARDS — if no user board fits, pick the best name from CATALOG (Rock, Music, Pop, Hip-Hop, Recipes, etc.)
3. NEVER Ideas/Inspiration when any catalog board fits — Ideas is only for truly unclassifiable links

Additional rules:
- Song titles matching a board name are NOT a topic match (song "Medicine" ≠ health board)
- Classify by SUBJECT/TOPIC — NOT by media format (never Video, Posts, Entertainment as catch-alls)
- NEVER pick Social Media, Social Network, or platform names as board — classify the POST topic from image/caption
- Instagram/TikTok/Pinterest with poor metadata (app name, login text, @handle only) → topic is in the IMAGE
- YouTube music → Rock, Music, or a genre catalog board — NOT Ideas
- board_name MUST match the genre/topic in your title and description
- is_new_board: true when picking a catalog board the user does not already have`;

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

board_name: MUST be exactly one name from ALLOWED BOARDS — MUST match the topic/genre in your title and description (if title says Rock, board must be Rock or Music, never Ideas)
title (max ${MAX_BOOKMARK_TITLE}): short label as [type] + [subject], not raw page title
description (max ${MAX_BOOKMARK_DESC}): 1–2 sentences about content — NEVER likes/comments/views/followers
${AI_COPY_LANGUAGE_RULE}
is_new_board: true only if user does not already have this board

${AI_BOARD_RULES}

JSON only: {"board_name":"...","title":"...","description":"...","is_new_board":true|false}`;
}

function isMisleadingCopyTitle(title: string, boardName: string, metadata: LinkMetadata): boolean {
  const t = title.toLowerCase();
  const b = boardName.toLowerCase();
  const meta = `${metadata.title} ${metadata.description}`.toLowerCase();
  const musicPrefixes = ['freestyle', 'track', 'live', 'live set', 'song', 'remix', 'mv'];

  if (/\bfreestyle\b/.test(t) && b !== 'hip-hop') return true;
  if (/\b(track|song|mv|official video|remix)\b/.test(t) && !isMusicRelatedBoardName(boardName)) return true;

  const prefix = title.split(':')[0]?.trim().toLowerCase() ?? '';
  if (prefix && !isMusicRelatedBoardName(boardName)) {
    if (musicPrefixes.some((p) => prefix === p || prefix.startsWith(`${p} `))) return true;
  }

  if (prefix && b.length >= 3) {
    const boardWords = b.split(/[\s-]+/).filter((w) => w.length >= 4);
    const prefixMatchesBoard = boardWords.some((w) => prefix.includes(w));
    const metaMatchesPrefix = prefix.length >= 4 && meta.includes(prefix);
    if (!prefixMatchesBoard && !metaMatchesPrefix && musicPrefixes.some((p) => prefix.includes(p))) {
      return true;
    }
  }

  return false;
}

function sanitizeAiBookmarkCopy(
  title: string,
  description: string,
  boardName: string,
  metadata: LinkMetadata,
  url: string,
): { title: string; description: string } {
  if (!isMisleadingCopyTitle(title, boardName, metadata)) {
    return { title: title.trim().slice(0, MAX_BOOKMARK_TITLE), description };
  }
  console.log('AI copy title rejected — rebuilding from board + metadata', {
    title: title.slice(0, 50),
    board: boardName,
  });
  return {
    title: buildTitleFromMetadata(metadata, url, boardName),
    description: description.trim() || buildDescriptionFromMetadata(metadata, url, boardName),
  };
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

${COPY_TITLE_RULES}
description (max ${MAX_BOOKMARK_DESC} chars): 1–2 sentences about WHAT the content is — from metadata only.
  NEVER platform boilerplate ("Enjoy the videos...", likes, views, subscribers).
  NEVER append "Original title:".
${AI_COPY_LANGUAGE_RULE}

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
${AI_BOARD_RULES}
- MUST pick from ALLOWED BOARDS only — classify what you SEE in the image (food, tattoo, outfit, workout, landscape, etc.)
- Ignore platform/login boilerplate in metadata — the image is the primary signal
- Quote / motivation text in image → Inspiration

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
  logClassifyMetadata(metadata, url, boardList, 'Groq unified');
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

  if (isCatchallBoardName(parsed.board_name)) {
    const tiered = resolveBoardTiered(
      metadata,
      url,
      boardList,
      catalog,
      `${parsed.title} ${parsed.description}`,
    );
    if (tiered) {
      console.log('Groq unified: tiered override', {
        from: parsed.board_name,
        to: tiered.board_name,
        tier: tiered.tier,
        aiTitle: parsed.title.slice(0, 60),
      });
      parsed.board_name = tiered.board_name;
      parsed.is_new_board = tiered.tier === 'catalog' &&
        !boardList.some((b) => b.toLowerCase() === tiered.board_name.toLowerCase());
    } else {
      const copyBoard = inferBoardFromText(`${parsed.title} ${parsed.description}`, boardList, catalog);
      if (copyBoard && !isCatchallBoardName(copyBoard)) {
        console.log('Groq unified: board/copy mismatch', {
          board: parsed.board_name,
          aiTitle: parsed.title.slice(0, 60),
          suggestedFromCopy: copyBoard,
        });
      }
    }
  }

  console.log('Groq unified: success (1-call)', {
    model: response.model,
    board: parsed.board_name,
    aiTitle: parsed.title.slice(0, 60),
  });
  return polishClassifyResult(parsed, metadata, url, boardList, catalog);
}

async function generateCopyWithGroq(
  metadata: LinkMetadata,
  url: string,
  boardName: string,
  apiKey: string,
): Promise<{ title: string; description: string } | null> {
  // Copy always uses 70B — 8B anchors on prompt patterns and hallucinates subjects
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await callGroq(
      buildTitleDescriptionPrompt(url, metadata, boardName),
      apiKey,
      [groqPrimaryModel()],
    );
    const parsed = parseJsonFromGemini<{ title: string; description: string }>(response?.text ?? '');
    if (!parsed?.title?.trim()) {
      console.log(`Groq copy attempt ${attempt}: no title in response`);
      continue;
    }
    const description = sanitizeBookmarkDescription(parsed.description ?? '') ||
      buildDescriptionFromMetadata(metadata, url, boardName);
    const sanitized = sanitizeAiBookmarkCopy(
      parsed.title,
      description,
      boardName,
      metadata,
      url,
    );
    console.log(`Groq copy attempt ${attempt}: ok`, {
      model: response?.model,
      title: sanitized.title.slice(0, 40),
    });
    return {
      title: sanitized.title,
      description: sanitized.description,
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
  const description = sanitizeBookmarkDescription(parsed.description) ||
    buildDescriptionFromMetadata(metadata, url, boardName);
  const sanitized = sanitizeAiBookmarkCopy(parsed.title, description, boardName, metadata, url);
  return {
    title: sanitized.title,
    description: sanitized.description,
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

  if (hasUnreliableSocialMetadata(metadata, url)) {
    console.log('Groq unified failed on sparse social — skipping 8B (unreliable metadata)');
    return null;
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
  logClassifyMetadata(metadata, url, boardList, 'Gemini unified');
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
  logClassifyMetadata(metadata, url, boardList, 'Gemini vision');
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
  if (!apiKey || !hasUsableVisionImage(metadata)) return null;

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
  const groqEnabled = Boolean(groqKey) && Deno.env.get('SKIP_GROQ') !== 'true';
  const geminiEnabled = Boolean(geminiKey) && Deno.env.get('SKIP_GEMINI') !== 'true';

  logClassifyMetadata(metadata, url, boardList, 'Classify');

  // 1. Tier-1 user boards + tier-2 catalog keywords (deterministic, free)
  const tiered = resolveBoardTiered(metadata, url, boardList, catalog);
  if (tiered) {
    console.log(`Classified tier-${tiered.tier === 'user' ? '1 (user board)' : '2 (catalog)'}`, {
      board: tiered.board_name,
    });
    return await classifyWithDeterministicBoard(
      boards, metadata, url, tiered.board_name, catalog, groqEnabled, geminiEnabled,
    );
  }

  // 2. Groq unified (board + title + description) — always first AI step
  if (groqEnabled) {
    const groq = await classifyWithGroq(boards, metadata, url, catalog);
    if (groq) {
      if (geminiEnabled) {
        const vision = await maybeUpgradeWithVision(boards, metadata, url, catalog, groq);
        if (vision) return vision;
      }
      if (shouldRejectTextOnlyAiOnSparseSocial(metadata, url)) {
        console.log('Rejecting text-only Groq pick on sparse social metadata');
      } else {
        return groq;
      }
    }

    if (geminiEnabled && needsVisionForUntrustworthySocial(metadata, url)) {
      console.log('Groq text exhausted on sparse social — trying Gemini vision');
      const vision = await classifyWithGeminiVision(boards, metadata, url, catalog);
      if (vision) return vision;
    } else {
      console.log('Groq could not classify — trying Gemini');
    }
  }

  // 3. Gemini text → vision when text fails or pick is generic
  if (geminiEnabled) {
    const geminiText = await classifyWithGeminiText(boards, metadata, url, catalog);
    if (geminiText) {
      const vision = await maybeUpgradeWithVision(boards, metadata, url, catalog, geminiText);
      if (vision) return vision;
      if (shouldRejectTextOnlyAiOnSparseSocial(metadata, url)) {
        console.log('Rejecting text-only Gemini pick on sparse social metadata');
      } else {
        return geminiText;
      }
    }

    if (
      hasUsableVisionImage(metadata) &&
      isSocialContentUrl(url) &&
      (!hasTrustworthyCaption(metadata, url) || shouldUseVision(metadata, url, null))
    ) {
      const geminiVision = await classifyWithGeminiVision(boards, metadata, url, catalog);
      if (geminiVision) return geminiVision;
    }

    console.log('Gemini could not classify — trying heuristics');
  } else if (!groqEnabled) {
    console.log('AI providers disabled or missing keys — trying heuristics');
  }

  // 4. Heuristics (AI unavailable, quota exhausted, or parse failure)
  const heuristic = tryHeuristicBoard(metadata, url, boardList, catalog);
  if (heuristic?.confident && !isRejectableBoardName(heuristic.board_name)) {
    console.log('Classified with heuristics (fallback)', { board: heuristic.board_name });
    return heuristicClassificationOutcome(boards, metadata, url, heuristic.board_name, catalog);
  }

  // 5. Ideas / Inspiration — absolute last resort
  return aiUnavailableFallbackOutcome(boards, metadata, url, catalog);
}

async function findExistingBookmark(
  supabase: SupabaseClient,
  userId: string,
  rawUrl: string,
  canonicalUrl: string,
) {
  for (const candidate of [canonicalUrl, rawUrl]) {
    if (!candidate) continue;
    const { data } = await supabase
      .from('bookmarks')
      .select('id, title, boards(name)')
      .eq('user_id', userId)
      .eq('url', candidate)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

function alreadySavedResponse(boardName: string, title?: string | null) {
  return json({
    success: true,
    already_saved: true,
    board_name: boardName,
    title: title ?? undefined,
  });
}

type SaveBookmarkBody = {
  url?: string;
  title?: string;
  description?: string;
  source_app?: string;
  preview?: boolean;
  confirmed?: boolean;
  board_id?: string;
  board_name?: string;
  thumbnail_url?: string | null;
};

type BoardRow = { id: string; name: string; cover_url: string | null };

async function resolveBoardForSave(
  supabase: SupabaseClient,
  userId: string,
  boardList: BoardRow[],
  boardName: string,
  coverUrl: string | null,
): Promise<{ boardId: string; boardName: string; isNewBoard: boolean } | { error: string }> {
  const existingBoard = boardList.find(
    (b) => b.name.toLowerCase() === boardName.toLowerCase(),
  );

  if (existingBoard) {
    if (!existingBoard.cover_url && coverUrl) {
      await supabase.from('boards').update({ cover_url: coverUrl }).eq('id', existingBoard.id);
    }
    return { boardId: existingBoard.id, boardName: existingBoard.name, isNewBoard: false };
  }

  const { data: newBoard, error: createError } = await supabase
    .from('boards')
    .insert({
      user_id: userId,
      name: boardName,
      cover_url: coverUrl,
    })
    .select('id, name')
    .single();

  if (createError) {
    return { error: createError.message };
  }

  return { boardId: newBoard.id, boardName: newBoard.name, isNewBoard: true };
}

async function saveConfirmedBookmark(
  supabase: SupabaseClient,
  userId: string,
  body: SaveBookmarkBody,
): Promise<Response> {
  const url = body.url?.trim();
  if (!url) {
    return json({ success: false, error: 'URL is required' }, 400);
  }

  const title = body.title?.trim();
  const description = body.description?.trim();
  if (!title || !description) {
    return json({ success: false, error: 'Title and description are required' }, 400);
  }

  const canonicalUrl = normalizeUrlForCache(url);
  const sourceApp = body.source_app?.trim() || 'Web';
  const thumbnailUrl = body.thumbnail_url?.trim() || null;

  const existingBookmark = await findExistingBookmark(supabase, userId, url, canonicalUrl);
  if (existingBookmark) {
    const boardName = (existingBookmark.boards as { name: string } | null)?.name ?? 'your board';
    return alreadySavedResponse(boardName, existingBookmark.title);
  }

  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, cover_url')
    .eq('user_id', userId);

  if (boardsError) {
    return json({ success: false, error: boardsError.message }, 500);
  }

  const boardList = boards ?? [];
  let boardId = body.board_id?.trim();
  let boardName = body.board_name?.trim() || '';
  let isNewBoard = false;

  if (boardId) {
    const board = boardList.find((b) => b.id === boardId);
    if (!board) {
      return json({ success: false, error: 'Board not found' }, 404);
    }
    boardName = board.name;
    if (!board.cover_url && thumbnailUrl) {
      await supabase.from('boards').update({ cover_url: thumbnailUrl }).eq('id', boardId);
    }
  } else if (boardName) {
    const resolved = await resolveBoardForSave(supabase, userId, boardList, boardName, thumbnailUrl);
    if ('error' in resolved) {
      return json({ success: false, error: resolved.error }, 500);
    }
    boardId = resolved.boardId;
    boardName = resolved.boardName;
    isNewBoard = resolved.isNewBoard;
  } else {
    return json({ success: false, error: 'Pick a board' }, 400);
  }

  const { error: insertError } = await supabase.from('bookmarks').insert({
    user_id: userId,
    board_id: boardId,
    url: canonicalUrl,
    title,
    description,
    source_app: sourceApp,
    thumbnail_url: thumbnailUrl,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      const dup = await findExistingBookmark(supabase, userId, url, canonicalUrl);
      const savedBoard = (dup?.boards as { name: string } | null)?.name ?? boardName;
      return alreadySavedResponse(savedBoard, dup?.title ?? title);
    }
    return json({ success: false, error: insertError.message }, 500);
  }

  return json({
    success: true,
    board_name: boardName,
    title,
    description,
    is_new_board: isNewBoard,
  });
}

async function saveClassifiedBookmark(
  supabase: SupabaseClient,
  userId: string,
  params: {
    rawUrl: string;
    canonicalUrl: string;
    sourceApp: string;
    metadata: Awaited<ReturnType<typeof fetchLinkMetadata>>;
    classified: ClassifyResult;
    boardList: BoardRow[];
  },
): Promise<Response> {
  const { rawUrl, canonicalUrl, sourceApp, metadata, classified, boardList } = params;

  const resolved = await resolveBoardForSave(
    supabase,
    userId,
    boardList,
    classified.board_name,
    metadata.image,
  );

  if ('error' in resolved) {
    return json({ success: false, error: resolved.error }, 500);
  }

  const { boardId, boardName, isNewBoard } = resolved;

  const { error: insertError } = await supabase.from('bookmarks').insert({
    user_id: userId,
    board_id: boardId,
    url: canonicalUrl,
    title: classified.title || metadata.title,
    description: classified.description,
    source_app: sourceApp,
    thumbnail_url: metadata.image,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      const dup = await findExistingBookmark(supabase, userId, rawUrl, canonicalUrl);
      const savedBoard = (dup?.boards as { name: string } | null)?.name ?? boardName;
      return alreadySavedResponse(savedBoard, dup?.title ?? classified.title);
    }
    return json({ success: false, error: insertError.message }, 500);
  }

  return json({
    success: true,
    board_name: boardName,
    title: classified.title,
    description: classified.description,
    is_new_board: isNewBoard,
  });
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

  let body: SaveBookmarkBody;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (body.confirmed) {
    return saveConfirmedBookmark(supabase, user.id, body);
  }

  const url = body.url?.trim();
  if (!url) {
    return json({ success: false, error: 'URL is required' }, 400);
  }

  const canonicalUrl = normalizeUrlForCache(url);
  const shareTitle = body.title?.trim() || '';
  const sourceApp = body.source_app?.trim() || 'Web';

  const existingBookmark = await findExistingBookmark(supabase, user.id, url, canonicalUrl);
  if (existingBookmark) {
    const boardName = (existingBookmark.boards as { name: string } | null)?.name ?? 'your board';
    return alreadySavedResponse(boardName, existingBookmark.title);
  }

  const metadata = await fetchLinkMetadata(canonicalUrl, shareTitle);

  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, cover_url')
    .eq('user_id', user.id);

  if (boardsError) {
    return json({ success: false, error: boardsError.message }, 500);
  }

  const boardList = boards ?? [];
  const catalog = await fetchBoardCatalog(supabase);

  const cacheUrl = canonicalUrl;
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
    classificationOutcome = await classifyLink(boardList, metadata, canonicalUrl, sourceApp, catalog);
    if (serviceClient && shouldCacheClassification(classificationOutcome.result, metadata, canonicalUrl)) {
      await saveClassificationCache(serviceClient, urlHash, cacheUrl, classificationOutcome);
      console.log('Classification cached', { board: classificationOutcome.result.board_name });
    }
  }

  const classified = classificationOutcome.result;

  const existingBoard = boardList.find(
    (b) => b.name.toLowerCase() === classified.board_name.toLowerCase(),
  );

  if (body.preview) {
    return json({
      success: true,
      preview: true,
      url: canonicalUrl,
      title: classified.title || metadata.title,
      description: classified.description,
      board_name: classified.board_name,
      board_id: existingBoard?.id ?? null,
      is_new_board: !existingBoard,
      thumbnail_url: metadata.image,
      source_app: sourceApp,
    });
  }

  return saveClassifiedBookmark(supabase, user.id, {
    rawUrl: url,
    canonicalUrl,
    sourceApp,
    metadata,
    classified,
    boardList,
  });
});

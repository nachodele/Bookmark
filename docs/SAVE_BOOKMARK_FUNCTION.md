# `save-bookmark/index.ts` structure

Map of the edge function at `supabase/functions/save-bookmark/index.ts` (~3,000 lines).  
For **what** it classifies and **when**, see [CLASSIFICATION.md](./CLASSIFICATION.md).

---

## Role

Single Deno edge function that:

1. Authenticates the user (JWT)
2. Fetches link metadata from the open web
3. Classifies board + title + description (cache → pipeline)
4. Returns a **preview** or **saves** the bookmark (+ creates board if needed)

Entry point: `Deno.serve` at the bottom of the file.

---

## File layout (top → bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  Constants & URL helpers          (~lines 1–90)             │
│  Board resolution & catalog       (~90–420)                 │
│  HTTP / JSON utilities            (~420–560)                │
│  Cache                            (~555–670)                │
│  Metadata fetching                (~670–1540)               │
│  Heuristics & board rules         (~865–1360)               │
│  Board validation & polish        (~1540–2010)              │
│  AI prompts & API clients         (~2010–2675)              │
│  classifyLink (orchestrator)      (~2678–2740)              │
│  Save / preview handlers          (~2740–2960)              │
│  Deno.serve (HTTP entry)          (~2964–end)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Constants & platform detection

| Symbol | Purpose |
|--------|---------|
| `SOCIAL_CONTENT_HOSTS` | Instagram, TikTok, YouTube, etc. |
| `isSocialContentUrl` | Social vs generic web |
| `isCommerceUrl` | Amazon, eBay, Etsy, Shopify |
| `isYouTubeUrl` / `isYouTubeMusicCandidate` | YouTube + song/video title patterns |
| `CATCHALL_BOARD_NAMES` | Ideas, Inspiration, … |
| `SUBJECT_KEYWORD_TO_BOARD` | Genre keywords → catalog board (Rock, Hip-Hop, …) |
| `GENERIC_TOPIC_RULES` | Umbrella + method keywords for heuristics |
| `AMBIGUOUS_BOARD_WORDS` | Words that must not match boards from title alone |
| `CACHE_VERSION` | Bump to invalidate classification cache |

---

## 2. Board catalog & resolution

| Function | Purpose |
|----------|---------|
| `fetchBoardCatalog` | Load `board_catalog` from Postgres (5 min in-memory cache) |
| `findInCatalog` / `pickCatalogBoard` | Resolve catalog name |
| `pickExistingOrCatalog` | User board first, then catalog; Music → Rock/Pop fallback |
| `pickBilingualBoard` | EN/ES catalog names |
| `resolveMusicCatalogBoard` | When "Music" isn't in catalog |
| `pickMusicBoardFromMetadata` | YouTube music → best genre board |
| `matchUserBoardTopic` | Tier-1 keyword → user's existing board |
| `matchCatalogTopic` | Tier-2 keyword → catalog only |
| `resolveBoardTiered` | User boards → catalog (used in AI post-processing) |
| `formatAllowedBoardsPrompt` | Text block for Groq/Gemini prompts |

---

## 3. AI post-processing & reconciliation

| Function | Purpose |
|----------|---------|
| `upgradeCatchallBoard` | Ideas → Rock/Music/etc. when metadata supports it |
| `reconcileBoardWithClassification` | Board must match AI title/description |
| `inferBoardFromText` | Keywords in combined text |
| `refineBoardName` | Normalize + granular refine + validate |
| `validateBoardChoice` | Fix mislabels (Art → Hip-Hop, Shopping → Music on YouTube) |
| `acceptAiBoardPick` | Reject platform names from AI |
| `polishClassifyResult` | Final pass on AI result; `plainCopy` mode for heuristics |

---

## 4. Heuristics module

| Function | Purpose |
|----------|---------|
| `tryHeuristicBoard` | Step 4 — keywords, YouTube music, granular sports/genres |
| `inferTopicBoard` | Title-first topic rules; skips boilerplate descriptions |
| `inferGranularBoard` | Scorelines, explicit genres in title |
| `matchGenericTopic` | `GENERIC_TOPIC_RULES` matcher |
| `isIncidentalUserBoardMatch` | Reject false user-board matches (song names) |
| `heuristicClassificationOutcome` | Build result with **plain** title/description |
| `plainCopyFromMetadata` | No `Video:` / `Music:` prefixes |
| `aiUnavailableFallbackOutcome` | Step 6 — Ideas / Inspiration |

---

## 5. Metadata fetching

| Function | Purpose |
|----------|---------|
| `fetchLinkMetadata` | Main orchestrator |
| `fetchExternalMetadata` | Parallel: noembed, Microlink, oEmbed |
| `fetchOEmbed` / `fetchNoembed` / `fetchMicrolink` | Individual providers |
| `extractYouTubePlayerData` | Parse `ytInitialPlayerResponse` from HTML |
| `pickBestTitle` / `pickBestDescription` | Merge candidates, drop generic titles |
| `cleanPageTitle` / `sanitizeMetadata` | Strip platform chrome |
| `isBoilerplateDescription` | YouTube/TikTok generic descriptions |
| `isSparseMetadata` | Triggers Gemini vision |

URL helpers: `normalizeUrl`, `normalizeUrlForCache`, `hashUrlForCache`, `extractYouTubeVideoId`.

---

## 6. Title & description builders

Used when AI does not generate copy (Groq/Gemini 2-step fallback) or for template fallbacks.

| Function | Purpose |
|----------|---------|
| `buildTitleFromMetadata` | Styled titles (`Recipe:`, `Track:`, football scorelines, …) |
| `buildDescriptionFromMetadata` | Styled descriptions for AI/template path |
| `youtubeVideoTitle` | Strip `\| YouTube` suffix |
| `compactMusicTitle` / `compactMusicSubject` | Short music labels (AI path) |
| Football helpers | `parseFootballScoreline`, `footballDisplayTitle`, … |

**Note:** Heuristic paths bypass styled builders via `plainCopyFromMetadata`.

---

## 7. Classification cache

| Function | Purpose |
|----------|---------|
| `lookupClassificationCache` | Read by URL hash + `CACHE_VERSION` |
| `saveClassificationCache` | Write after successful classify |
| `shouldCacheClassification` | Skip weak/invalid results |
| `createServiceSupabaseClient` | Service role for cache table |

Table: `link_classification_cache` (60-day TTL).

---

## 8. AI providers

### Prompts

| Function | Purpose |
|----------|---------|
| `AI_BOARD_RULES` | Shared rules string |
| `buildUnifiedClassifyPrompt` | Board + title + description (1-call) |
| `buildBoardPrompt` | Board only |
| `buildTitleDescriptionPrompt` | Copy given a board |
| `buildBoardVisionPrompt` | Vision board pick |

### Groq

| Function | Purpose |
|----------|---------|
| `callGroq` / `callGroqModel` | HTTP to Groq chat completions |
| `classifyWithGroqUnified` | 70B one-shot |
| `pickBoardWithGroq` + `generateCopyWithGroq` | 8B two-step |
| `classifyWithGroq` | Groq entry (unified → 2-step) |

Models: `GROQ_MODEL` (70B), `GROQ_FALLBACK_MODEL` (8B).

### Gemini

| Function | Purpose |
|----------|---------|
| `callGemini` / `callGeminiGenerate` | Google Generative Language API |
| `classifyWithGeminiUnified` | Text 1-call |
| `pickBoardWithGemini` / `pickBoardWithGeminiVision` | Board pick (+ image) |
| `generateCopyWithGemini` | Title + description |
| `classifyWithGeminiText` / `classifyWithGeminiVision` | Gemini entry points |
| `fetchImageBase64` | Thumbnail for vision |

### Shared AI helpers

| Function | Purpose |
|----------|---------|
| `parseJsonFromGemini` | Parse JSON from model output (used for Groq too) |
| `buildBoardOnlyResult` | Board pick + async copy generation |
| `resolveIsNewBoard` | `is_new_board` flag |

---

## 9. Pipeline orchestrator

```typescript
async function classifyLink(...)  // ~line 2678
```

Implements the 5-step pipeline:

1. Tier-1 user boards → `heuristicClassificationOutcome`
2. `classifyWithGroq` → `maybeUpgradeWithVision` if generic pick + thumbnail
3. `classifyWithGeminiText` → same upgrade; vision fallback if text fails on sparse social
4. `tryHeuristicBoard`
5. `aiUnavailableFallbackOutcome`

Key helpers: `hasTrustworthyCaption`, `isGenericTextClassificationResult`, `maybeUpgradeWithVision`.

Called from `Deno.serve` after metadata fetch, unless cache hits.

---

## 10. HTTP handler & persistence

| Function | Purpose |
|----------|---------|
| `findExistingBookmark` | Dedupe by URL |
| `resolveBoardForSave` | Find or create board |
| `saveClassifiedBookmark` | Insert bookmark row |
| `saveConfirmedBookmark` | User edited preview → save |
| `alreadySavedResponse` | JSON for duplicate URL |

### Request modes (`Deno.serve`)

| Body flag | Behavior |
|-----------|----------|
| `preview: true` | Classify only — return board/title/description for Review save UI |
| `confirmed: true` | Save user-edited preview |
| (default) | Classify + save in one shot (legacy share flow) |

Auth: `Authorization: Bearer <user JWT>` — RLS scopes boards/bookmarks to `user_id`.

---

## Types (inline)

| Type | Fields |
|------|--------|
| `LinkMetadata` | `title`, `description`, `image` |
| `ClassifyResult` | `board_name`, `title`, `description`, `is_new_board` |
| `ClassificationOutcome` | `source` (`groq` \| `gemini` \| `heuristic`), `result` |
| `BoardCatalog` | `names[]`, `groupsText` |
| `SaveBookmarkBody` | `url`, `preview`, `confirmed`, `board_name`, … |

---

## Where to change what

| Goal | Edit |
|------|------|
| Pipeline order | `classifyLink` |
| Heuristic rules | `GENERIC_TOPIC_RULES`, `tryHeuristicBoard` |
| AI prompt wording | `AI_BOARD_RULES`, `build*Prompt` |
| Commerce detection | `isCommerceUrl` (cache guard only — known marketplaces, no `/product` path) |
| YouTube music logic | `isYouTubeMusicCandidate`, `pickMusicBoardFromMetadata` |
| Cache invalidation | `CACHE_VERSION` |
| New catalog boards | SQL migration + optional `FALLBACK_CATALOG` |
| Preview/save API shape | `Deno.serve`, `saveConfirmedBookmark` |

After logic changes: bump `CACHE_VERSION`, deploy:

```bash
supabase functions deploy save-bookmark --project-ref YOUR_PROJECT_REF
```

---

## Related docs

- [CLASSIFICATION.md](./CLASSIFICATION.md) — pipeline behavior and examples
- [GROQ_SETUP.md](./GROQ_SETUP.md) — Groq secrets
- [GEMINI_SETUP.md](./GEMINI_SETUP.md) — Gemini secrets
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) — project bootstrap

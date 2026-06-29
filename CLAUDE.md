# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
Bookmark/
├── mobile/          # Expo React Native app (the product)
├── supabase/        # Backend: migrations, edge functions
└── docs/            # Deep-dive guides (classification, setup, etc.)
```

All app development happens under `mobile/`. All commands below assume `mobile/` as the working directory unless noted.

## Commands

```bash
# Install
npm install

# Run on device/emulator
npm run android
npm run ios

# Type-check (the only linter configured)
npm run lint        # tsc --noEmit

# Build distributable APK (requires EAS login)
npm run build:apk   # EAS preview profile → shareable APK

# Export web build
npm run build:web

# Push env vars to EAS
npm run eas:env

# Deploy Supabase edge function (from repo root)
supabase functions deploy save-bookmark

# Apply a new migration (from repo root)
supabase db push
```

There is no test suite configured.

## Architecture

### Mobile App (Expo Router, file-based routing)

`mobile/app/` maps directly to routes:
- `(tabs)/` — bottom-tab group: Home (`index.tsx`), Search (`search.tsx`), Account (`account.tsx`)
- `board/[id].tsx` — board detail screen
- `auth/callback.tsx` — OAuth redirect handler
- `set-password.tsx` — post-OAuth password enforcement
- `settings.tsx` — theme + account settings
- `_layout.tsx` — root layout; wraps everything in `SafeAreaProvider → ThemeProvider → AuthProvider → NetworkProvider → ShareIntentRoot`

### State Management

React Context API only — no Redux or Zustand:
- `AuthContext` — session, user, sign-in/out helpers
- `ThemeContext` — dark/light/system, persisted to AsyncStorage
- `NetworkContext` — online/offline flag via `@react-native-community/netinfo`
- `ShareReviewContext` — orchestrates the share-sheet → review → save flow

### API Layer (`mobile/lib/api/`)

Thin wrappers around the Supabase JS client. Each file owns one domain:
- `boards.ts` — CRUD for boards + cover image URL helpers
- `bookmarks.ts` — CRUD for bookmarks, move between boards
- `share.ts` — processes share intent (calls `save-bookmark` edge function)
- `manual-save.ts` — save a URL without going through share intent
- `storage.ts` — board cover image uploads to Supabase Storage

### Supabase Client (`mobile/lib/supabase/client.ts`)

Single `createClient` instance using `AsyncStorage` for session persistence and `auto-refresh`. Import from here everywhere — do not create new instances.

TypeScript types for the DB are in `mobile/lib/supabase/database.types.ts` (auto-generated; regenerate with `supabase gen types typescript --project-id <id>`).

### Auth Flow (`mobile/lib/auth/`)

Email/password + Google OAuth. After OAuth signup, users are required to set a password (`password-setup.ts`) before proceeding. OAuth deep-link handling: `oauth.ts` → `oauth-flow.ts` → `oauth-callback.ts` → `auth/callback.tsx`.

### Edge Function (`supabase/functions/save-bookmark/`)

Deno runtime. The main orchestrator for saving a bookmark:
1. Fetch page metadata (title, description, og:image)
2. Classify the link via a three-tier AI pipeline:
   - **Heuristics** — domain/URL pattern matching
   - **Groq** (primary) — Llama 70B for category, Llama 8B for tags
   - **Gemini** (fallback + vision) — used when Groq fails or for image-heavy pages
3. Persist bookmark + classification to Postgres; classification results are cached 60 days (`url_classifications` table)

See `docs/CLASSIFICATION.md` and `docs/SAVE_BOOKMARK_FUNCTION.md` for the full pipeline spec.

### Database

Migrations in `supabase/migrations/`. RLS enforces per-user isolation on every table — all queries are implicitly scoped to `auth.uid()`. Key tables:
- `boards` — user categories ("nooks")
- `bookmarks` — the **rich central resource/fact table**: core fields + enrichment (`ai_category`/`final_category`/`was_recategorized` provenance, `domain`, `resource_type`, `keywords[]`, `embedding vector(768)` via pgvector, behavioral signals, soft-delete). Intended as the "mother table" for future model training.
- `board_catalog` — global category taxonomy (reference data, not per-user)
- `link_classification_cache` — cross-user URL→classification cache (keyed by `url_hash`)
- `resource_training_view` — denormalized, RLS-safe (`security_invoker`) flat view over `bookmarks` + taxonomy for ML export.

Note: app data is tiny (~KB/bookmark); storage growth comes from images (Storage bucket, separate quota), not the DB. Covers are downscaled+compressed on upload (`mobile/lib/api/storage.ts`).

### Offline Support

Home screen (`app/(tabs)/index.tsx`) caches board + bookmark data in AsyncStorage. `NetworkContext` exposes the online/offline flag; `OfflineBanner` component renders when offline.

## Environment Variables

Required in `mobile/.env` (copy from `.env.example`):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Supabase edge function secrets (set via `supabase secrets set`):
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

## Build System

EAS Build profiles are in `mobile/eas.json`:
- `development` — dev client APK for physical device testing
- `preview` — shareable APK (used by `build:apk`)
- `production` — AAB for Play Store

Path alias `@/*` resolves to `mobile/*` (configured in `tsconfig.json`).

## Key Docs

- `docs/CLASSIFICATION.md` — full AI classification pipeline
- `docs/SAVE_BOOKMARK_FUNCTION.md` — edge function internals
- `docs/SUPABASE_SETUP.md` — Supabase project bootstrap
- `docs/GROQ_SETUP.md` / `docs/GEMINI_SETUP.md` — AI provider setup
- `docs/ANDROID_SETUP.md` — Android build and share-intent setup
- `docs/R2_SETUP.md` — Cloudflare R2 image storage (presigned uploads via `r2-upload` edge fn)

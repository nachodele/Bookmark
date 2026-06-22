# Bookmark

AI-powered link organizer for **Android and iOS**. Share URLs from any app (YouTube, Instagram, TikTok, WhatsApp, …); the backend fetches metadata, classifies the link, and saves it to the right board — Pinterest-style, but for links instead of screenshots.

**v1 is mobile-only.** Collaboration and desktop capture are planned for v2.

---

## How it works

```
Phone (Share Sheet)
    → save-bookmark edge function (Supabase)
        → fetch title / description / thumbnail (oEmbed, Microlink, OG tags)
        → classify board (heuristics → Groq → Gemini → Ideas/Inspiration)
        → write bookmark + board to Postgres (RLS per user)
    → mobile app reads boards + links (online or cached offline)
```

| Layer | Tech |
|-------|------|
| Mobile app | Expo React Native, expo-router, expo-share-intent |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| AI | Groq (text) + Gemini (vision/fallback); heuristics always run first |
| Builds | EAS Build (APK for testing, AAB for Play Store) |

Each user has **private** boards and bookmarks. There is no shared data in v1.

---

## Repository structure

```
Bookmark/
├── mobile/                          # Expo React Native app (the product)
│   ├── app/                         # Screens (tabs, board detail, settings)
│   ├── components/                  # UI components
│   ├── lib/                         # Supabase client, API helpers
│   └── scripts/                     # e.g. set-app-icon.sh
├── supabase/
│   ├── migrations/                  # Database schema (run in order)
│   └── functions/save-bookmark/     # AI + metadata + classification cache
└── docs/                            # Detailed setup guides
    ├── CLASSIFICATION.md            # Full pipeline (heuristics → Groq → Gemini)
    ├── SUPABASE_SETUP.md
    ├── GEMINI_SETUP.md
    ├── GROQ_SETUP.md
    └── ANDROID_SETUP.md
```

### Database migrations (run in order)

| File | Purpose |
|------|---------|
| `20240617000000_boards_schema.sql` | Core `boards` + `bookmarks` tables, RLS |
| `20240619000000_board_covers_storage.sql` | Board cover images in Storage |
| `20240620000000_fix_rls_auto_enable_permissions.sql` | RLS policy fixes |
| `20240621000000_board_catalog.sql` | Global `board_catalog` (~45 starter categories) |
| `20240622000000_expand_board_catalog.sql` | Expanded catalog (~257 categories) |
| `20240623000000_link_classification_cache.sql` | 60-day classification cache |
| `20240624000000_legacy_board_catalog.sql` | English gaps + Spanish legacy boards |
| `20240625000000_classification_cache_groq_source.sql` | Cache `groq` as a classification source |

**User boards** are created on demand when the AI assigns a category. **`board_catalog`** is a global reference list the classifier reads — it is not copied per user.

---

## v1 — current scope

Shipped and intended for a first release on Android (iOS supported with extra Xcode setup).

### Capture & save

- Native **Share Sheet** integration (requires a dev/production build — not Expo Go)
- URL normalization + metadata enrichment from multiple sources
- **Classification pipeline** — see [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md) for full details
  1. **Heuristics (primary)** — umbrella nouns + domain methods; skips AI when confident
  2. **Groq / Llama** — 70B unified (1 call) → 8B two-step fallback
  3. **Gemini flash-lite** — text fallback + vision (thumbnail on sparse social posts)
  4. **Generic board** — Ideas / Inspiration if both APIs fail (no topic guessing)
- **Classification cache** (60-day TTL) to avoid re-classifying the same URL
- **308+ catalog categories** (English + Spanish) for AI + bilingual heuristic picks

### App UX

- Email/password auth — each user sees only their own data
- Home: boards grid + **Recent** saves
- **Global search** across title, URL, description, board name
- Board detail: search within board, rename/delete board
- Long-press bookmark: move, rename, delete
- Bookmark detail modal with edit
- Dark / light / system theme
- Settings: theme, change password
- Offline cache of boards and links

### Explicitly out of v1

- Shared or collaborative boards
- Web / desktop app
- Browser extension
- Pre-seeded default boards on sign-up (boards appear as content is saved)

---

## v2 — planned

| Feature | Description |
|---------|-------------|
| **Shared boards / collaboration** | Invite others to a board; co-curate links (similar to Pool’s shared pools) |
| **Web / desktop app** | Browse and manage bookmarks from a browser on PC |
| **Browser extension** | Save links from Chrome/Safari/Firefox without the mobile Share Sheet |

Other ideas discussed but not committed: default starter boards per locale, richer board covers, export, notifications.

---

## Quick start

### 1. Supabase

**New project?** Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** step by step.

Summary:

1. Create project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Enable **Email** auth
3. Run all migrations in `supabase/migrations/` (oldest first) via SQL Editor or CLI
4. Deploy `save-bookmark` + set `GEMINI_API_KEY` secret
5. Copy URL + anon key into `mobile/.env`

### 2. AI backend

See [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md) for the full pipeline.

**Groq (primary):** [docs/GROQ_SETUP.md](docs/GROQ_SETUP.md)  
**Gemini (fallback + vision):** [docs/GEMINI_SETUP.md](docs/GEMINI_SETUP.md)

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set GROQ_FALLBACK_MODEL=llama-3.1-8b-instant
supabase secrets set GEMINI_API_KEY=AIza...
supabase functions deploy save-bookmark --project-ref YOUR_PROJECT_REF
```

### 3. Mobile app

```bash
cd mobile
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run android:prebuild
npm run android
```

- **Android device/emulator:** [docs/ANDROID_SETUP.md](docs/ANDROID_SETUP.md)
- **iOS:** `npm run ios:prebuild` then open in Xcode / `npm run ios`
- **Installable APK (no USB):** `npx eas build --platform android --profile preview` from `mobile/`

---

## Maintenance & operations

Day-to-day work splits into **backend** (Supabase) and **mobile** (Expo). They deploy independently: DB/function changes do not require an app rebuild unless the app code or env vars change.

### Deploy edge function changes

After editing `supabase/functions/save-bookmark/`:

```bash
supabase functions deploy save-bookmark --project-ref YOUR_PROJECT_REF
```

No app rebuild needed for classifier logic, cache, or catalog prompt changes.

### Apply new database migrations

If `supabase db push` fails on an existing project (policies already exist), apply new files individually:

```bash
supabase db query --linked -f supabase/migrations/YYYYMMDDHHMMSS_name.sql
```

Or paste the SQL into **Supabase → SQL Editor**.

### Classification cache

- Table: `link_classification_cache` — stores board/title/description per normalized URL
- TTL: **60 days**; bump `CACHE_VERSION` in `save-bookmark/index.ts` when classification logic changes materially (invalidates old entries)
- Current version: **16**

### AI secrets (Supabase Edge Functions)

Set via CLI or Dashboard → Edge Functions → Secrets. Full reference: [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md#supabase-secrets-complete-list).

| Secret | Required | Purpose |
|--------|----------|---------|
| `GROQ_API_KEY` | For AI classify | Groq authentication — [GROQ_SETUP.md](docs/GROQ_SETUP.md) |
| `GROQ_MODEL` | Recommended | Primary model (`llama-3.3-70b-versatile`) |
| `GROQ_FALLBACK_MODEL` | Recommended | Fallback model (`llama-3.1-8b-instant`) |
| `GEMINI_API_KEY` | For fallback/vision | Google AI — [GEMINI_SETUP.md](docs/GEMINI_SETUP.md) |
| `GEMINI_MODEL` | Optional | Override Gemini model |
| `SKIP_GROQ` / `SKIP_GEMINI` | Optional | Debug toggles |

```bash
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set GROQ_FALLBACK_MODEL=llama-3.1-8b-instant
supabase secrets set GEMINI_API_KEY=AIza...
```

Rotate: `supabase secrets set KEY=new-value`. Redeploy after **code** changes, not required for secret-only updates.

Without API keys, heuristics handle obvious links; everything else goes to **Ideas** / **Inspiration**.

### Board catalog

- Table: `board_catalog` — global list of allowed category names for AI prompts
- Add categories via idempotent SQL migrations (`on conflict (name) do update`)
- Edge function caches catalog for **5 minutes** — no redeploy needed after DB-only catalog updates

### Mobile releases

| Goal | Command (from `mobile/`) |
|------|--------------------------|
| Local dev build | `npm run android` / `npm run ios` |
| Shareable APK | `npx eas build --platform android --profile preview` |
| Play Store | `npx eas build --platform android --profile production` |

Env vars (`EXPO_PUBLIC_*`) are baked in at build time — change `.env` and rebuild to update them.

### App icon

Place source image at `mobile/assets/app-icon-source.png`, then:

```bash
bash mobile/scripts/set-app-icon.sh
```

Rebuild the app afterward.

### Regenerate TypeScript types (optional)

After schema changes:

```bash
supabase gen types typescript --linked > mobile/lib/supabase/database.types.ts
```

### Common issues

| Symptom | Likely cause |
|---------|----------------|
| Share target missing | Need dev/production build, not Expo Go |
| Everything goes to “Shopping” | AI unavailable + commerce URL; or check function logs |
| Generic board (Video, Tutorials) | Redeploy latest `save-bookmark`; set `GROQ_API_KEY` and/or `GEMINI_API_KEY` |
| `supabase db push` fails | Apply newer migrations manually with `db query -f` |
| App works on new PC but not old | Backend is cloud-hosted — reinstall app + same `.env` is enough |

### Logs

- **Edge function:** Supabase Dashboard → Edge Functions → `save-bookmark` → Logs
- **Mobile:** Metro terminal, or `adb logcat` on Android

---

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/.env` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/.env` | Public anon key (RLS protects data) |
| `GROQ_API_KEY` | Supabase secrets | Groq authentication |
| `GROQ_MODEL` | Supabase secrets | Primary Groq model (70B unified) |
| `GROQ_FALLBACK_MODEL` | Supabase secrets | Fallback Groq model (8B two-step) |
| `GEMINI_API_KEY` | Supabase secrets | Gemini text fallback + vision |
| `GEMINI_MODEL` | Supabase secrets | Optional Gemini model override |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected in edge functions | Server-side DB writes + cache |

Never commit `.env` or service role keys.

---

## Further reading

- [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md) — **classification pipeline** (order, heuristics, AI, cache)
- [docs/SAVE_BOOKMARK_FUNCTION.md](docs/SAVE_BOOKMARK_FUNCTION.md) — **`index.ts` structure** (modules, functions, where to edit)
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — new project from scratch
- [docs/GROQ_SETUP.md](docs/GROQ_SETUP.md) — Groq API + secrets
- [docs/GEMINI_SETUP.md](docs/GEMINI_SETUP.md) — Gemini API + secrets
- [docs/ANDROID_SETUP.md](docs/ANDROID_SETUP.md) — emulator, device, Share Sheet testing

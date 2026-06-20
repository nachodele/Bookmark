# New Supabase project setup

Follow these steps after creating a project at [supabase.com/dashboard](https://supabase.com/dashboard).

## 1. Create the project

1. **New project** → pick a name (e.g. `bookmark`)
2. Set a **database password** (save it somewhere safe)
3. Pick a **region** close to your users
4. Wait until the project status is **Active** (green)

From **Project Settings → General**, copy:

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **Project ref** (e.g. `abcdefghijklmnop`) → needed for CLI
- **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 2. Enable email auth

1. **Authentication → Providers → Email**
2. Enable **Email** provider
3. For development you can turn **off** “Confirm email” so sign-up works instantly
4. For production, turn **on** confirm email
5. **Authentication → URL Configuration** — add these **Redirect URLs**:
   - `https://bookmark-bxm.pages.dev/` (PWA email verification — use trailing slash)
   - `https://bookmark-bxm.pages.dev/**` (wildcard, optional)
   - `bookmark://auth/callback` (optional — if the installed app opens the link)

   Set **Site URL** to `https://bookmark-bxm.pages.dev` (no path).

   Do **not** use `/auth/callback` — the PWA is a single-page app and only `/` is served on Cloudflare Pages.

## 3. Run the database migration

1. Open **SQL Editor → New query**
2. Paste the full contents of:

   `supabase/migrations/20240617000000_boards_schema.sql`

3. Click **Run**

You should see `boards` and `bookmarks` under **Table Editor**, both with RLS enabled.

Boards start **empty** — the AI creates them when a user saves their first link (no pre-seeded categories).

## 4. Deploy the save-bookmark function

### Option A — Supabase CLI (recommended)

```bash
brew install supabase/tap/supabase   # if not installed

supabase login
cd /path/to/Bookmark
supabase link --project-ref YOUR_PROJECT_REF

supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set GROQ_FALLBACK_MODEL=llama-3.1-8b-instant
supabase secrets set GEMINI_API_KEY=AIza...
supabase functions deploy save-bookmark
```

- Groq key: [console.groq.com](https://console.groq.com)
- Gemini key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Full secret list: [CLASSIFICATION.md](./CLASSIFICATION.md#supabase-secrets-complete-list)

### Option B — Dashboard (no CLI)

1. **Edge Functions → Create function** → name: `save-bookmark`
2. Paste code from `supabase/functions/save-bookmark/index.ts`
3. **Project Settings → Edge Functions → Secrets** → add:
   - `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `GEMINI_API_KEY`
4. Deploy

The function URL will be:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/save-bookmark`

## 5. Update the mobile app

```bash
cd mobile
cp .env.example .env
```

Edit `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

Restart Expo if it's running:

```bash
npm start
```

## 6. Smoke test

1. Open app → **Account** → **Create account** with email + password
2. Confirm user appears under **Authentication → Users** in Supabase
3. Share a link from another app (or test after Android build)
4. Check **Table Editor → bookmarks** for a new row

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Supabase is not configured” | Check `.env` values, restart Metro |
| Sign-up fails | Email provider enabled? Password min 6 chars |
| Save fails 401 | User must be signed in; check anon key |
| Save fails 500 | Function deployed? `GEMINI_API_KEY` set? |
| Tables missing | Re-run migration SQL |
| Project paused | Resume in dashboard or use this new project |

## Security notes

- Never put `GEMINI_API_KEY` or **service role** key in the mobile app
- Only **anon** key goes in `mobile/.env`
- RLS ensures users only access their own rows

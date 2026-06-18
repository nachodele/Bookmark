# Bookmark

AI-powered link organizer for **Android and iOS**. Share URLs from any app; Gemini classifies them into visual boards.

## Structure

```
Bookmark/
├── mobile/                 # Expo React Native app
├── supabase/
│   ├── migrations/         # Database schema + RLS
│   └── functions/          # save-bookmark edge function (AI + storage)
└── docs/                   # Setup guides
```

## Quick start

### 1. Supabase

**New project?** Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)** step by step.

Summary:

1. Create project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Enable **Email** auth
3. Run `supabase/migrations/20240617000000_boards_schema.sql` in SQL Editor
4. Deploy `save-bookmark` function + set `GEMINI_API_KEY` secret
5. Copy URL + anon key into `mobile/.env`

### 2. AI backend

See [docs/GEMINI_SETUP.md](docs/GEMINI_SETUP.md).

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=your-key
supabase functions deploy save-bookmark
```

### 3. Mobile app (Android first)

```bash
cd mobile
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run android:prebuild
npm run android
```

iOS later: `npm run ios:prebuild` then `npm run ios`.

> Share extensions need a **dev build** — Expo Go is not supported.

## Features (v1)

- Email/password accounts — each user sees only their own data
- Share Sheet save (Android + iOS)
- AI board assignment + descriptions (Gemini, free tier)
- Home boards grid + **Recent** saves
- **Global search** across all links
- Long-press: move, rename, delete bookmarks
- Board rename / delete
- Dark / light / system theme
- Offline board cache

## v2 (planned)

- Shared boards / collaboration
- Web / desktop app
- Browser extension

## Environment

| Variable | Where |
|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | `mobile/.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `mobile/.env` |
| `GEMINI_API_KEY` | Supabase secrets |

# Gemini setup (vision + text fallback)

Bookmark uses a **multi-provider** pipeline. Full details: **[CLASSIFICATION.md](./CLASSIFICATION.md)**

Gemini is **not** the primary classifier — **Groq** is. Gemini handles:

1. **Text fallback** when Groq fails or rate-limits (429)
2. **Vision** — sparse Instagram/TikTok posts (thumbnail + minimal caption)

Your phone never talks to Gemini directly — keys stay on Supabase.

## Step 1 — Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google
3. Click **Create API key**
4. Copy the key (starts with `AIza...`)

Free tier is enough for personal and early public use.

## Step 2 — Add secrets to Supabase

The key must **not** go in the mobile `.env`. Set all AI secrets together — see also [GROQ_SETUP.md](./GROQ_SETUP.md):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GROQ_API_KEY=gsk_...
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set GROQ_FALLBACK_MODEL=llama-3.1-8b-instant
supabase secrets set GEMINI_API_KEY=AIza...your-key-here
supabase functions deploy save-bookmark
```

Optional — use a smarter (still free) model:

```bash
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
```

Default is `gemini-2.5-flash-lite` (cheapest). Groq handles most text classification; Gemini is mainly fallback + vision.

## What Gemini is used for

- **Text fallback** when Groq is rate-limited (429)
- **Vision** — classifying sparse Instagram/TikTok posts from thumbnail + minimal caption

Gemini receives the URL, title, description, source app, and the user's board list. It returns a board assignment and one-sentence description. Each user's boards are isolated.

## Step 3 — Test

Share a link from your phone. Most links classify via heuristics or Groq; Gemini runs when needed for fallback or vision.

If both AI providers fail (429), the link is saved to **Ideas** or **Inspiration** — see [CLASSIFICATION.md](./CLASSIFICATION.md).

## Related

- [CLASSIFICATION.md](./CLASSIFICATION.md) — full pipeline
- [GROQ_SETUP.md](./GROQ_SETUP.md) — primary Groq setup

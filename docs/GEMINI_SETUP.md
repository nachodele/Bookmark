# Gemini setup (free AI classification)

Bookmark uses **Google Gemini** inside a Supabase Edge Function. Your phone never talks to Gemini directly — the key stays on Supabase's servers.

## Step 1 — Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google
3. Click **Create API key**
4. Copy the key (starts with `AIza...`)

Free tier is enough for personal and early public use.

## Step 2 — Add the key to Supabase

The key must **not** go in the mobile `.env`. Only Supabase needs it.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=AIza...your-key-here
supabase functions deploy save-bookmark
```

Optional — use a smarter (still free) model:

```bash
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
```

Default is `gemini-2.5-flash-lite` (cheapest, good for link sorting).

## Step 3 — Test

Share a link from your phone. You should see **Saved to [Board Name]** with an AI-written description.

If Gemini fails (bad key, quota), the function falls back to rule-based classification — it still saves, just less smart.

## What the AI does

When a user shares a link, Gemini receives:

- The URL and title
- Which app they shared from (YouTube, Instagram, etc.)
- **That user's** existing board names

It returns a board assignment and one-sentence description. Each user's boards are isolated — User A's "Recipes" is separate from User B's.

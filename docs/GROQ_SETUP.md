# Groq setup (text classification)

Bookmark uses **Groq** (Llama) as the **primary text AI**. **Gemini** handles fallback + vision.

Full pipeline details: **[CLASSIFICATION.md](./CLASSIFICATION.md)**

---

## Step 1 — Get a Groq API key

1. Go to [console.groq.com](https://console.groq.com)
2. Create an account
3. **API Keys → Create API Key**
4. Copy the key (starts with `gsk_`)

Free tier is enough for personal use. Quota is **separate from Google/Gemini**.

Check your limits: [console.groq.com/settings/limits](https://console.groq.com/settings/limits)

---

## Step 2 — Set all Supabase secrets

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Required for Groq
supabase secrets set GROQ_API_KEY=gsk_...your-key-here

# Recommended — explicit model selection (matches code defaults)
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
supabase secrets set GROQ_FALLBACK_MODEL=llama-3.1-8b-instant

# Required for fallback + vision
supabase secrets set GEMINI_API_KEY=AIza...your-key-here

supabase functions deploy save-bookmark --project-ref YOUR_PROJECT_REF
```

Or add the same keys in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**.

### Secret reference

| Secret | Required | Default (in code) | Purpose |
|--------|----------|-------------------|---------|
| `GROQ_API_KEY` | Yes | — | Groq authentication |
| `GROQ_MODEL` | Recommended | `llama-3.3-70b-versatile` | Unified 1-call classify |
| `GROQ_FALLBACK_MODEL` | Recommended | `llama-3.1-8b-instant` | 2-step fallback |
| `GEMINI_API_KEY` | Yes (for fallback) | — | Text fallback + vision |

Optional debug flags: `SKIP_GROQ=true`, `SKIP_GEMINI=true`

---

## Dual-model strategy

| Model | When used | API calls |
|-------|-----------|-----------|
| **70B** (`GROQ_MODEL`) | First — board + title + description together | **1** |
| **8B** (`GROQ_FALLBACK_MODEL`) | Only if 70B fails or rate-limits | **2** (board → copy) |

```
70B unified  →  success ✅ (1 call)
            →  fail/429  →  8B board + 8B title/desc
            →  still fail  →  Gemini
```

**Why both:** 70B has higher **TPM** (12K) and better one-shot JSON. 8B preserves 70B's lower **RPD** (1K/day) for when it matters.

---

## Step 3 — Cache migration (if upgrading)

If upgrading from Gemini-only:

```bash
supabase db query --linked -f supabase/migrations/20240625000000_classification_cache_groq_source.sql
```

---

## Verify

1. Share a link from your phone
2. **Supabase → Edge Functions → save-bookmark → Logs**  
   Look for `Groq unified: success (1-call)` or `Classified with Groq (2-step)`
3. **console.groq.com → Logs**  
   One 70B request = ideal; two 8B requests = fallback path

---

## Related

- [CLASSIFICATION.md](./CLASSIFICATION.md) — full pipeline
- [GEMINI_SETUP.md](./GEMINI_SETUP.md) — Gemini setup

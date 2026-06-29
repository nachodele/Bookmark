# Cloudflare R2 image storage

Images (board covers, thumbnails) are the main driver of storage growth, so they live
in **Cloudflare R2** (10 GB free, no egress fees) instead of Supabase Storage. The DB
only stores the resulting public URL. Uploads are compressed client-side first
(`mobile/lib/api/storage.ts`: resize ≤1080px + JPEG q0.7).

## Architecture

```
mobile → compress → POST /functions/v1/r2-upload (auth)  → { uploadUrl, publicUrl }
mobile → PUT bytes → uploadUrl (presigned, R2 S3 API)
mobile → store publicUrl on the resource
```

R2 credentials never reach the client — the `r2-upload` edge function signs a short-lived
(120s) presigned PUT URL with `aws4fetch` (SigV4).

## One-time setup

1. **Create the bucket** (Cloudflare dashboard → R2, or the scoped Cloudflare MCP):
   bucket name e.g. `nook-images`.
2. **Enable public read**: turn on the `r2.dev` subdomain, or connect a custom domain
   (recommended for production). This base URL becomes `R2_PUBLIC_BASE`.
3. **Create an R2 API token** (Object Read & Write, scoped to the bucket) → note the
   Access Key ID and Secret Access Key.
4. **Set edge-function secrets** (from repo root):
   ```bash
   supabase secrets set \
     R2_ACCOUNT_ID=xxxxxxxx \
     R2_ACCESS_KEY_ID=xxxxxxxx \
     R2_SECRET_ACCESS_KEY=xxxxxxxx \
     R2_BUCKET=nook-images \
     R2_PUBLIC_BASE=https://images.example.com
   ```
5. **Deploy the function**:
   ```bash
   supabase functions deploy r2-upload
   ```
6. **Flip the client flag**: set `EXPO_PUBLIC_R2_ENABLED=true` in `mobile/.env`
   (and push to EAS: `npm run eas:env`).

## CORS

R2 must allow PUT from the app origin. Add a bucket CORS rule:
```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"] }]
```
Tighten `AllowedOrigins` to your web origin(s) for production.

## Migrating existing objects

There are only a few legacy covers in the Supabase `board-covers` bucket. Either leave
them (their public URLs keep working) or copy them to R2 and update the `boards.cover_url`
rows. Not urgent — new uploads go straight to R2 once the flag is on.
```

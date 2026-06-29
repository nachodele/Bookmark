// Returns a short-lived presigned PUT URL for Cloudflare R2 (S3-compatible API),
// so the mobile client can upload compressed images directly to R2 without ever
// holding R2 credentials. Images live in R2 (10 GB free, no egress fees); the DB
// only stores the resulting public URL.
//
// Required edge-function secrets (supabase secrets set ...):
//   R2_ACCOUNT_ID         - Cloudflare account id
//   R2_ACCESS_KEY_ID      - R2 API token access key
//   R2_SECRET_ACCESS_KEY  - R2 API token secret
//   R2_BUCKET             - bucket name (e.g. nook-images)
//   R2_PUBLIC_BASE        - public base URL for reads (r2.dev domain or custom domain),
//                           no trailing slash, e.g. https://images.nook.app

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_KINDS = new Set(['covers', 'thumbnails']);
const PRESIGN_TTL_SECONDS = 120;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET');
  const publicBase = Deno.env.get('R2_PUBLIC_BASE');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    return json({ error: 'R2 not configured' }, 500);
  }

  let bodyJson: { kind?: string; contentType?: string };
  try {
    bodyJson = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const kind = bodyJson.kind ?? 'covers';
  if (!ALLOWED_KINDS.has(kind)) return json({ error: 'Invalid kind' }, 400);
  // compressImage always uploads JPEG; lock the content type to match.
  const contentType = 'image/jpeg';

  const key = `${user.id}/${kind}/${Date.now()}.jpg`;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  // signQuery => credentials go in the query string, producing a presigned URL.
  const signed = await client.sign(
    `${endpoint}?X-Amz-Expires=${PRESIGN_TTL_SECONDS}`,
    {
      method: 'PUT',
      headers: { 'content-type': contentType },
      aws: { signQuery: true },
    },
  );

  return json({
    uploadUrl: signed.url,
    publicUrl: `${publicBase}/${key}`,
    contentType,
  });
});

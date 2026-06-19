#!/usr/bin/env bash
# Push Supabase env vars from .env to EAS (preview profile) before cloud builds.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing mobile/.env — copy .env.example and fill in your Supabase values."
  exit 1
fi

echo "Pushing environment variables to EAS (preview)..."
npx eas env:push preview --path .env --force

echo "Done. Run: npm run build:apk"

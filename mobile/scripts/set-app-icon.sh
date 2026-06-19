#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$ROOT/assets/app-icon-source.png}"
ASSETS="$ROOT/assets"

if [[ ! -f "$SOURCE" ]]; then
  echo "Source image not found: $SOURCE"
  echo "Save your icon as mobile/assets/app-icon-source.png or pass a path:"
  echo "  bash scripts/set-app-icon.sh /path/to/icon.png"
  exit 1
fi

echo "Using source: $SOURCE"

make_square_png() {
  local input="$1"
  local output="$2"
  local size="$3"
  local tmp
  tmp="$(mktemp -t bookmark-icon.XXXXXX.png)"
  sips -s format png "$input" --out "$tmp" >/dev/null
  sips -z "$size" "$size" "$tmp" --out "$output" >/dev/null
  rm -f "$tmp"
}

make_square_png "$SOURCE" "$ASSETS/icon.png" 1024
make_square_png "$SOURCE" "$ASSETS/android-icon-foreground.png" 1024
make_square_png "$SOURCE" "$ASSETS/splash-icon.png" 512
make_square_png "$SOURCE" "$ASSETS/favicon.png" 48

# Monochrome + background for Android adaptive icon
cp "$ASSETS/android-icon-foreground.png" "$ASSETS/android-icon-monochrome.png"
make_square_png "$SOURCE" "$ASSETS/android-icon-background.png" 1024

IOS_ICON="$ROOT/ios/Bookmark/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
if [[ -f "$IOS_ICON" ]]; then
  cp "$ASSETS/icon.png" "$IOS_ICON"
fi

echo "Updated:"
echo "  assets/icon.png"
echo "  assets/android-icon-foreground.png"
echo "  assets/android-icon-background.png"
echo "  assets/android-icon-monochrome.png"
echo "  assets/splash-icon.png"
echo "  assets/favicon.png"
if [[ -f "$IOS_ICON" ]]; then
  echo "  ios AppIcon 1024 asset"
fi
echo ""
echo "Rebuild the app to see the new icon on device:"
echo "  npm run android   # or npm run build:apk for a fresh APK"

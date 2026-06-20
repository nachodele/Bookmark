#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const fontSrc = path.join(__dirname, '..', 'public', 'assets', 'fonts', 'Ionicons.ttf');
const fontDest = path.join(distDir, 'assets', 'fonts', 'Ionicons.ttf');

if (!fs.existsSync(indexPath)) {
  console.warn('[Bookmark] dist/index.html not found — run expo export first');
  process.exit(1);
}

if (fs.existsSync(fontSrc)) {
  fs.mkdirSync(path.dirname(fontDest), { recursive: true });
  fs.copyFileSync(fontSrc, fontDest);
  console.log('Copied Ionicons.ttf to dist/assets/fonts/');
}

let html = fs.readFileSync(indexPath, 'utf8');

const iconFontBlock = [
  '<link rel="preload" href="/assets/fonts/Ionicons.ttf" as="font" type="font/ttf" crossorigin />',
  '<style id="bookmark-ionicons">',
  "@font-face {",
  "  font-family: 'ionicons';",
  "  src: url('/assets/fonts/Ionicons.ttf') format('truetype');",
  '  font-display: swap;',
  '}',
  '</style>',
].join('\n');

if (!html.includes('bookmark-ionicons')) {
  html = html.replace('</head>', `${iconFontBlock}\n</head>`);
}

if (!html.includes('manifest.webmanifest')) {
  const inject = [
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="/pwa-icon.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="apple-mobile-web-app-title" content="Bookmark" />',
  ].join('\n');
  html = html.replace('</head>', `${inject}\n</head>`);
}

fs.writeFileSync(indexPath, html);
console.log('Patched dist/index.html for PWA (icons + manifest)');

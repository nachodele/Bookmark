#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

if (html.includes('manifest.webmanifest')) {
  process.exit(0);
}

const inject = [
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/pwa-icon.png" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Bookmark" />',
].join('\n');

html = html.replace('</head>', `${inject}\n</head>`);
fs.writeFileSync(indexPath, html);
console.log('Patched dist/index.html with PWA meta tags');

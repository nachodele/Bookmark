#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const fontSrc = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo/vector-icons',
  'build',
  'vendor',
  'react-native-vector-icons',
  'Fonts',
  'Ionicons.ttf',
);

const fontDest = path.join(__dirname, '..', 'public', 'assets', 'fonts', 'Ionicons.ttf');

if (!fs.existsSync(fontSrc)) {
  console.warn('[Bookmark] Ionicons.ttf not found — run npm install');
  process.exit(0);
}

fs.mkdirSync(path.dirname(fontDest), { recursive: true });
fs.copyFileSync(fontSrc, fontDest);
console.log('Copied Ionicons.ttf to public/assets/fonts/');

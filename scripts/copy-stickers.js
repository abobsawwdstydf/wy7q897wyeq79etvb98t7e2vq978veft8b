/**
 * Reads gif.txt, copies ALL GIFs to web/public/stickers/nexo/
 * and generates a manifest JSON for the seed script.
 *
 * Run: node scripts/copy-stickers.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GIF_TXT = path.join(ROOT, 'все телеграм паки и анимированые эмодзи', 'gif.txt');
const DEST_DIR = path.join(ROOT, 'web', 'public', 'stickers', 'nexo');
const MANIFEST_PATH = path.join(ROOT, 'web', 'public', 'stickers', 'manifest.json');
const SOURCE_BASE = path.join(ROOT, 'все телеграм паки и анимированые эмодзи');

// Read and parse gif.txt
const raw = fs.readFileSync(GIF_TXT, 'utf8');
const lines = raw.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean);

console.log(`Lines in gif.txt: ${lines.length}`);

// Build pack -> files mapping
const packs = {};
for (const line of lines) {
  const parts = line.split(/\\/);
  const packName = parts[0];
  const gifFilename = parts[parts.length - 1];

  if (!packs[packName]) packs[packName] = [];
  packs[packName].push(gifFilename);
}

const packNames = Object.keys(packs).sort();
console.log(`Unique packs: ${packNames.length}`);

// Create dest directory
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

// Clean old files
const oldFiles = fs.readdirSync(DEST_DIR);
console.log(`Removing ${oldFiles.length} old files from stickers/nexo/...`);
for (const f of oldFiles) {
  fs.unlinkSync(path.join(DEST_DIR, f));
}

// Copy all GIFs
let copied = 0;
let missing = 0;
let errors = 0;
const manifest = [];

for (const packName of packNames) {
  const gifs = packs[packName];
  const packEntry = { name: packName, stickers: [] };

  for (const gifFilename of gifs) {
    const sourcePath = path.join(SOURCE_BASE, packName, 'gif', gifFilename);
    const destFilename = `${packName}_${gifFilename}`;
    const destPath = path.join(DEST_DIR, destFilename);

    try {
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        const stats = fs.statSync(destPath);
        packEntry.stickers.push({
          filename: destFilename,
          fileUrl: `/stickers/nexo/${destFilename}`,
          fileSize: stats.size,
          emoji: `:${gifFilename.replace(/\.gif$/, '').replace(/[^a-z0-9]/gi, '_')}:`,
        });
        copied++;
      } else {
        missing++;
      }
    } catch (e) {
      errors++;
      if (errors <= 10) console.error(`Error copying ${sourcePath}: ${e.message}`);
    }
  }

  if (packEntry.stickers.length > 0) {
    manifest.push(packEntry);
  }
}

console.log(`\nDone! Copied: ${copied}, Missing: ${missing}, Errors: ${errors}`);
console.log(`Packs with stickers: ${manifest.length}`);

// Write manifest
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Manifest written to ${MANIFEST_PATH}`);

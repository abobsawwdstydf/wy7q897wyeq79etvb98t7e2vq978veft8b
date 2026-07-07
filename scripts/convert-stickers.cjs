const sharp = require('sharp');
const { readdir, stat, unlink } = require('fs/promises');
const { join, extname } = require('path');
const os = require('os');

const STICKERS_DIR = join(__dirname, '..', 'web', 'public', 'stickers');
const CONCURRENCY = Math.min(os.cpus().length * 4, 32);

async function findGifFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findGifFiles(fullPath));
    } else if (extname(entry.name).toLowerCase() === '.gif') {
      results.push(fullPath);
    }
  }
  return results;
}

async function convertOne(filePath) {
  try {
    const webpPath = filePath.replace(/\.gif$/i, '.webp');
    try { await stat(webpPath); await unlink(filePath); return true; } catch {}
    const buffer = await sharp(filePath, { animated: true }).webp({ quality: 80, effort: 4 }).toBuffer();
    await sharp(buffer).toFile(webpPath);
    await unlink(filePath);
    return true;
  } catch { return false; }
}

async function runPool(files, concurrency) {
  let idx = 0, done = 0, failed = 0;
  async function worker() {
    while (idx < files.length) {
      const i = idx++;
      const ok = await convertOne(files[i]);
      ok ? done++ : failed++;
      if (done % 200 === 0 && done > 0) {
        console.log(`[${new Date().toLocaleTimeString()}] ${done + failed}/${files.length} (ok=${done} fail=${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { done, failed };
}

async function main() {
  console.log(`Scanning... (concurrency=${CONCURRENCY})`);
  const gifFiles = await findGifFiles(STICKERS_DIR);
  console.log(`Found ${gifFiles.length} GIF files, starting conversion...`);
  const t0 = Date.now();
  const { done, failed } = await runPool(gifFiles, CONCURRENCY);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${sec}s: ${done} converted, ${failed} failed`);
}

main().catch(console.error);

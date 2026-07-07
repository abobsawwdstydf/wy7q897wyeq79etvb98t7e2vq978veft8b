import sharp from 'sharp';
import { readdir, stat, rename, unlink } from 'fs/promises';
import { join, extname } from 'path';

const STICKERS_DIR = join(import.meta.dirname, '..', 'web', 'public', 'stickers');

async function convertGifToWebp(filePath: string): Promise<boolean> {
  try {
    const webpPath = filePath.replace(/\.gif$/i, '.webp');
    
    // Check if webp already exists
    try {
      await stat(webpPath);
      // WebP exists, skip conversion but delete old GIF
      await unlink(filePath);
      return true;
    } catch {
      // No webp yet, convert
    }

    const buffer = await sharp(filePath, { animated: true })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();

    await sharp(buffer).toFile(webpPath);
    await unlink(filePath);
    return true;
  } catch (err) {
    console.error(`FAIL: ${filePath} — ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log(`Scanning ${STICKERS_DIR}...`);
  
  const entries = await readdir(STICKERS_DIR, { withFileTypes: true });
  const gifFiles: string[] = [];
  
  for (const entry of entries) {
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.gif') {
      gifFiles.push(join(STICKERS_DIR, entry.name));
    }
  }
  
  console.log(`Found ${gifFiles.length} GIF files`);
  
  let done = 0;
  let failed = 0;
  const BATCH = 50;
  
  for (let i = 0; i < gifFiles.length; i += BATCH) {
    const batch = gifFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(convertGifToWebp));
    done += results.filter(Boolean).length;
    failed += results.filter(r => !r).length;
    
    if ((i + BATCH) % 500 === 0 || i + BATCH >= gifFiles.length) {
      console.log(`Progress: ${done}/${gifFiles.length} (${failed} failed)`);
    }
  }
  
  console.log(`\nDone: ${done} converted, ${failed} failed`);
}

main().catch(console.error);

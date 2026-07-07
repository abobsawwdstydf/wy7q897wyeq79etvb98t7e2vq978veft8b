/**
 * Seed script: Creates individual StickerPack per folder from manifest.json.
 * Each pack from gif.txt becomes its own StickerPack in the DB.
 *
 * Run: npx ts-node prisma/seed-nexo-stickers.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const MANIFEST_PATH = path.join(__dirname, '..', 'web', 'public', 'stickers', 'manifest.json');

interface StickerEntry {
  filename: string;
  fileUrl: string;
  fileSize: number;
  emoji: string;
}

interface PackEntry {
  name: string;
  stickers: StickerEntry[];
}

function formatPackName(raw: string): string {
  // Convert camelCase/PascalCase to readable name
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ Manifest not found. Run: node scripts/copy-stickers.js');
    process.exit(1);
  }

  const manifest: PackEntry[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  console.log(`📦 Loaded manifest with ${manifest.length} packs`);

  let totalStickers = 0;
  let createdPacks = 0;
  let skippedPacks = 0;

  for (const pack of manifest) {
    // Check if pack already exists
    const existing = await prisma.stickerPack.findFirst({
      where: { name: pack.name }
    });

    if (existing) {
      skippedPacks++;
      totalStickers += pack.stickers.length;
      continue;
    }

    // Create the pack
    const stickerPack = await prisma.stickerPack.create({
      data: {
        name: pack.name,
        description: `Пак ${formatPackName(pack.name)} — ${pack.stickers.length} стикеров`,
        creatorId: 'system',
        isPublic: true,
        isAnimated: true,
      }
    });

    // Create stickers in batches
    const BATCH = 200;
    for (let i = 0; i < pack.stickers.length; i += BATCH) {
      const batch = pack.stickers.slice(i, i + BATCH).map((s, idx) => ({
        packId: stickerPack.id,
        emoji: s.emoji,
        fileUrl: s.fileUrl,
        fileSize: s.fileSize,
        isAnimated: true,
        order: i + idx,
      }));

      await prisma.sticker.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }

    createdPacks++;
    totalStickers += pack.stickers.length;

    if (createdPacks % 50 === 0) {
      console.log(`  Progress: ${createdPacks} packs created, ${totalStickers} stickers total`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`  Packs created: ${createdPacks}`);
  console.log(`  Packs skipped (already exist): ${skippedPacks}`);
  console.log(`  Total stickers: ${totalStickers}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

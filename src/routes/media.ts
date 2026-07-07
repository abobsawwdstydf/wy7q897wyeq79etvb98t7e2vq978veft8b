import express from 'express';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { UPLOADS_ROOT } from '../shared';

const router = express.Router();

// Multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла'));
    }
  }
});

/**
 * Detect if image is animated (GIF, APNG)
 */
function isAnimatedImage(mimetype: string, buffer: Buffer): boolean {
  if (mimetype === 'image/gif') return true;
  if (mimetype === 'image/apng') return true;
  // Check for APNG signature in PNG buffer
  if (mimetype === 'image/png') {
    // APNG has 'acTL' chunk after PNG signature
    const str = buffer.toString('ascii', 0, Math.min(buffer.length, 1024));
    return str.includes('acTL');
  }
  return false;
}

/**
 * Convert image to modern format (AVIF for static, Animated WebP for animated)
 * POST /api/media/convert
 */
router.post('/convert', upload.single('image') as any, async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Файл не загружен' });

    const { originalFormat } = req.body; // Original format for download restoration
    const animated = isAnimatedImage(file.mimetype, file.buffer);

    let result: Buffer;
    let outputMime: string;
    let outputExt: string;

    if (animated) {
      // Animated images → Animated WebP
      try {
        result = await sharp(file.buffer, { animated: true })
          .webp({ quality: 85, effort: 6 })
          .toBuffer();
        outputMime = 'image/webp';
        outputExt = 'webp';
      } catch {
        // Fallback: keep original if WebP conversion fails
        result = file.buffer;
        outputMime = file.mimetype;
        outputExt = file.mimetype.split('/')[1] || 'png';
      }
    } else {
      // Static images → AVIF
      try {
        result = await sharp(file.buffer)
          .avif({ quality: 80, effort: 6 })
          .toBuffer();
        outputMime = 'image/avif';
        outputExt = 'avif';
      } catch {
        // Fallback: keep original if AVIF conversion fails
        result = file.buffer;
        outputMime = file.mimetype;
        outputExt = file.mimetype.split('/')[1] || 'png';
      }
    }

    const filename = `converted_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${outputExt}`;
    const filepath = path.join(UPLOADS_ROOT, 'photos', filename);

    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filepath, result);

    // Get dimensions
    const metadata = await sharp(result).metadata();

    const url = `/uploads/photos/${filename}`;
    res.json({
      url,
      width: metadata.width,
      height: metadata.height,
      mimeType: outputMime,
      originalMimeType: file.mimetype,
      size: result.length,
      originalSize: file.buffer.length,
      savings: Math.round((1 - result.length / file.buffer.length) * 100),
    });
  } catch (error) {
    console.error('Convert image error:', error);
    res.status(500).json({ error: 'Ошибка конвертации' });
  }
});

/**
 * Convert uploaded image for storage (called by upload pipeline)
 * Returns converted buffer + metadata without saving to disk
 */
export async function convertForStorage(buffer: Buffer, mimetype: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  extension: string;
}> {
  const animated = isAnimatedImage(mimetype, buffer);

  if (animated) {
    try {
      const converted = await sharp(buffer, { animated: true })
        .webp({ quality: 85, effort: 6 })
        .toBuffer();
      return { buffer: converted, mimeType: 'image/webp', extension: 'webp' };
    } catch {
      return { buffer, mimeType: mimetype, extension: mimetype.split('/')[1] || 'png' };
    }
  } else {
    try {
      const converted = await sharp(buffer)
        .avif({ quality: 80, effort: 6 })
        .toBuffer();
      return { buffer: converted, mimeType: 'image/avif', extension: 'avif' };
    } catch {
      return { buffer, mimeType: mimetype, extension: mimetype.split('/')[1] || 'png' };
    }
  }
}

/**
 * Restore original format for download
 * Convert AVIF/WebP back to original format (PNG/JPEG/GIF)
 */
export async function restoreOriginalFormat(
  buffer: Buffer,
  currentMime: string,
  originalFormat?: string
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  // If no original format specified, return as-is
  if (!originalFormat) {
    return { buffer, mimeType: currentMime, extension: currentMime.split('/')[1] || 'bin' };
  }

  const fmt = originalFormat.toLowerCase();

  // Convert Animated WebP back to GIF (best compatibility)
  if (fmt === 'gif' && currentMime === 'image/webp') {
    try {
      const converted = await sharp(buffer, { animated: true })
        .gif()
        .toBuffer();
      return { buffer: converted, mimeType: 'image/gif', extension: 'gif' };
    } catch {
      return { buffer, mimeType: currentMime, extension: 'webp' };
    }
  }

  // Convert AVIF back to PNG
  if (fmt === 'png' && currentMime === 'image/avif') {
    try {
      const converted = await sharp(buffer).png().toBuffer();
      return { buffer: converted, mimeType: 'image/png', extension: 'png' };
    } catch {
      return { buffer, mimeType: currentMime, extension: 'avif' };
    }
  }

  // Convert AVIF back to JPEG
  if ((fmt === 'jpg' || fmt === 'jpeg') && currentMime === 'image/avif') {
    try {
      const converted = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
      return { buffer: converted, mimeType: 'image/jpeg', extension: 'jpg' };
    } catch {
      return { buffer, mimeType: currentMime, extension: 'avif' };
    }
  }

  // Convert AVIF/WebP back to original
  if (fmt === 'webp' && currentMime === 'image/avif') {
    try {
      const converted = await sharp(buffer).webp({ quality: 90 }).toBuffer();
      return { buffer: converted, mimeType: 'image/webp', extension: 'webp' };
    } catch {
      return { buffer, mimeType: currentMime, extension: 'avif' };
    }
  }

  return { buffer, mimeType: currentMime, extension: currentMime.split('/')[1] || 'bin' };
}

/**
 * Photo editor - apply filters and effects
 */
router.post('/edit-photo', upload.single('photo') as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { filter, brightness, saturation, blur, rotate, text, textX, textY, textSize, textColor } = req.body;

    let image = sharp(file.buffer);

    if (rotate) {
      const angle = parseInt(rotate);
      image = image.rotate(angle);
    }

    if (blur) {
      const blurAmount = parseFloat(blur);
      if (blurAmount > 0) image = image.blur(blurAmount);
    }

    const modulate: any = {};
    if (brightness) modulate.brightness = parseFloat(brightness);
    if (saturation) modulate.saturation = parseFloat(saturation);
    if (Object.keys(modulate).length > 0) image = image.modulate(modulate);

    if (filter) {
      switch (filter) {
        case 'grayscale': image = image.grayscale(); break;
        case 'sepia': image = image.tint({ r: 112, g: 66, b: 20 }); break;
        case 'negative': image = image.negate(); break;
        case 'blur': image = image.blur(5); break;
        case 'sharpen': image = image.sharpen(); break;
      }
    }

    if (text) {
      const safeTextX = Math.max(0, Math.min(1000, Number(textX) || 50));
      const safeTextY = Math.max(0, Math.min(1000, Number(textY) || 50));
      const safeTextSize = Math.max(8, Math.min(200, Number(textSize) || 40));
      const safeTextColor = String(textColor || '#ffffff').replace(/[^#0-9a-fA-F]/g, '').slice(0, 7);
      const safeText = String(text).replace(/[<>&"']/g, '').slice(0, 500);
      const textSvg = `<svg width="1000" height="1000"><text x="${safeTextX}" y="${safeTextY}" font-size="${safeTextSize}" fill="${safeTextColor}" stroke="#000000" stroke-width="2">${safeText}</text></svg>`;
      image = image.composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }]);
    }

    // Save as AVIF (modern format)
    const filename = `edited_${Date.now()}_${userId}.avif`;
    const filepath = path.join(UPLOADS_ROOT, 'photos', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await image.avif({ quality: 85 }).toFile(filepath);

    const url = `/uploads/photos/${filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Edit photo error:', error);
    res.status(500).json({ error: 'Ошибка редактирования фото' });
  }
});

/**
 * Add sticker to photo
 */
router.post('/add-sticker', upload.single('photo') as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = req.file;
    
    if (!file) return res.status(400).json({ error: 'Файл не загружен' });

    const { stickerUrl } = req.body;
    if (!stickerUrl) return res.status(400).json({ error: 'URL стикера обязателен' });

    const image = sharp(file.buffer);

    const filename = `stickered_${Date.now()}_${userId}.avif`;
    const filepath = path.join(UPLOADS_ROOT, 'photos', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await image.avif({ quality: 85 }).toFile(filepath);

    const url = `/uploads/photos/${filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Add sticker error:', error);
    res.status(500).json({ error: 'Ошибка добавления стикера' });
  }
});

/**
 * Create thumbnail
 */
router.post('/thumbnail', upload.single('photo') as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = req.file;
    
    if (!file) return res.status(400).json({ error: 'Файл не загружен' });

    const { width = 200, height = 200 } = req.body;

    const filename = `thumb_${Date.now()}_${userId}.avif`;
    const filepath = path.join(UPLOADS_ROOT, 'thumbnails', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await sharp(file.buffer)
      .resize(parseInt(width), parseInt(height), { fit: 'cover' })
      .avif({ quality: 80 })
      .toFile(filepath);

    const url = `/uploads/thumbnails/${filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Create thumbnail error:', error);
    res.status(500).json({ error: 'Ошибка создания миниатюры' });
  }
});

/**
 * Serve video notes (redirect to correct endpoint)
 */
router.get('/video-notes/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    res.redirect(301, `/api/video-notes/file/${filename}`);
  } catch (error) {
    console.error('Video note redirect error:', error);
    res.status(500).json({ error: 'Ошибка загрузки видеокружка' });
  }
});

export default router;

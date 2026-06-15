import express from 'express';
import { prisma } from '../db';
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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла'));
    }
  }
});

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

    const { filter, brightness, contrast, saturation, blur, rotate, text, textX, textY, textSize, textColor } = req.body;

    let image = sharp(file.buffer);

    // Apply rotation
    if (rotate) {
      const angle = parseInt(rotate);
      image = image.rotate(angle);
    }

    // Apply blur
    if (blur) {
      const blurAmount = parseFloat(blur);
      if (blurAmount > 0) {
        image = image.blur(blurAmount);
      }
    }

    // Apply brightness/contrast/saturation
    const modulate: any = {};
    if (brightness) modulate.brightness = parseFloat(brightness);
    if (saturation) modulate.saturation = parseFloat(saturation);
    if (Object.keys(modulate).length > 0) {
      image = image.modulate(modulate);
    }

    // Apply filters
    if (filter) {
      switch (filter) {
        case 'grayscale':
          image = image.grayscale();
          break;
        case 'sepia':
          image = image.tint({ r: 112, g: 66, b: 20 });
          break;
        case 'negative':
          image = image.negate();
          break;
        case 'blur':
          image = image.blur(5);
          break;
        case 'sharpen':
          image = image.sharpen();
          break;
      }
    }

    // Add text overlay (basic implementation)
    if (text) {
      const textSvg = `
        <svg width="1000" height="1000">
          <text x="${textX || 50}" y="${textY || 50}" 
                font-size="${textSize || 40}" 
                fill="${textColor || '#ffffff'}"
                stroke="#000000" stroke-width="2">
            ${text}
          </text>
        </svg>
      `;
      image = image.composite([{
        input: Buffer.from(textSvg),
        top: 0,
        left: 0
      }]);
    }

    // Save edited image
    const filename = `edited_${Date.now()}_${userId}.jpg`;
    const filepath = path.join(UPLOADS_ROOT, 'photos', filename);
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await image.jpeg({ quality: 90 }).toFile(filepath);

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
    
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { stickerUrl, stickerX, stickerY, stickerWidth, stickerHeight } = req.body;

    if (!stickerUrl) {
      return res.status(400).json({ error: 'URL стикера обязателен' });
    }

    const image = sharp(file.buffer);

    // Download sticker (if URL provided)
    // For now, we'll skip actual sticker overlay and just return the original
    // In production, you'd fetch the sticker and composite it

    const filename = `stickered_${Date.now()}_${userId}.jpg`;
    const filepath = path.join(UPLOADS_ROOT, 'photos', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await image.jpeg({ quality: 90 }).toFile(filepath);

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
    
    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { width = 200, height = 200 } = req.body;

    const filename = `thumb_${Date.now()}_${userId}.jpg`;
    const filepath = path.join(UPLOADS_ROOT, 'thumbnails', filename);
    
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await sharp(file.buffer)
      .resize(parseInt(width), parseInt(height), { fit: 'cover' })
      .jpeg({ quality: 80 })
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
    // Redirect to the correct video notes endpoint
    res.redirect(301, `/api/video-notes/file/${filename}`);
  } catch (error) {
    console.error('Video note redirect error:', error);
    res.status(500).json({ error: 'Ошибка загрузки видеокружка' });
  }
});

export default router;

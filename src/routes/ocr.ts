import express from 'express';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';

const router = express.Router();

// Multer config for image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'));
    }
  }
});

// OCR endpoint - disabled (requires external service)
router.post('/extract', upload.single('image') as any, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Изображение обязательно' });
    }

    // OCR requires external service integration
    res.status(503).json({
      success: false,
      error: 'Функция распознавания текста временно недоступна',
      message: 'Для использования этой функции требуется интеграция с внешним сервисом OCR'
    });
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ error: 'Ошибка извлечения текста' });
  }
});

// OCR from URL - disabled
router.post('/extract-url', async (req: AuthRequest, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'URL изображения обязателен' });
    }

    // OCR requires external service integration
    res.status(503).json({
      success: false,
      error: 'Функция распознавания текста временно недоступна',
      message: 'Для использования этой функции требуется интеграция с внешним сервисом OCR'
    });
  } catch (error) {
    console.error('OCR URL error:', error);
    res.status(500).json({ error: 'Ошибка извлечения текста из URL' });
  }
});

export default router;

import express from 'express';
import { AuthRequest } from '../middleware/auth';
import multer from 'multer';

const router = express.Router();

// Multer config for audio upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы разрешены'));
    }
  }
});

// Speech-to-text endpoint - disabled (requires external service)
router.post('/transcribe', upload.single('audio') as any, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Аудио файл обязателен' });
    }

    // Speech-to-text requires external service integration
    res.status(503).json({
      success: false,
      error: 'Функция транскрипции аудио временно недоступна',
      message: 'Для использования этой функции требуется интеграция с внешним сервисом распознавания речи'
    });
  } catch (error) {
    console.error('Speech-to-text error:', error);
    res.status(500).json({ error: 'Ошибка транскрипции аудио' });
  }
});

// Real-time speech recognition - disabled
router.post('/transcribe-stream', async (req: AuthRequest, res) => {
  try {
    res.status(503).json({
      success: false,
      error: 'Функция потоковой транскрипции временно недоступна',
      message: 'Для использования этой функции требуется интеграция с внешним сервисом распознавания речи'
    });
  } catch (error) {
    console.error('Streaming speech-to-text error:', error);
    res.status(500).json({ error: 'Ошибка потоковой транскрипции' });
  }
});

export default router;

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Получить все устройства пользователя
router.get('/', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const devices = await prisma.userDevice.findMany({
      where: { userId: authReq.userId },
      orderBy: { lastActive: 'desc' },
    });

    // Помечаем текущее устройство и форматируем ответ
    const rawDeviceHeader = req.headers['x-device-id'];
    const currentDeviceId = Array.isArray(rawDeviceHeader) ? rawDeviceHeader[0] : rawDeviceHeader;
    
    // Parse browser from user agent
    const parseBrowser = (ua: string) => {
      if (!ua) return 'Unknown';
      if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
      if (ua.includes('Firefox')) return 'Firefox';
      if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
      if (ua.includes('Edg')) return 'Edge';
      if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
      return 'Browser';
    };

    // Parse OS from user agent
    const parseOS = (platform: string | null, ua: string) => {
      if (platform) return platform;
      if (!ua) return 'Unknown';
      if (ua.includes('Windows')) return 'Windows';
      if (ua.includes('Mac OS') || ua.includes('Macintosh')) return 'macOS';
      if (ua.includes('Linux')) return 'Linux';
      if (ua.includes('Android')) return 'Android';
      if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
      return 'Unknown';
    };

    // Parse location from IP (simplified)
    const parseLocation = (ip: string | null) => {
      if (!ip) return 'Не определено';
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return 'Локальное устройство';
      return ip;
    };

    const devicesWithCurrent = devices.map(d => ({
      id: d.id,
      deviceName: d.deviceName,
      browser: parseBrowser(d.userAgent || ''),
      os: parseOS(d.platform, d.userAgent || ''),
      ip: d.ipAddress || 'Не определён',
      location: parseLocation(d.ipAddress),
      lastActive: d.lastActive.toISOString(),
      isCurrent: d.deviceId === currentDeviceId,
      addedAt: d.createdAt.toISOString(),
    }));

    res.json(devicesWithCurrent);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Выйти с устройства (удалить сессию)
router.delete('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const deviceId = String(req.params.deviceId);

    // Проверяем, что устройство принадлежит пользователю
    const device = await prisma.userDevice.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== authReq.userId) {
      return res.status(403).json({ error: 'Device not found or access denied' });
    }

    // Удаляем устройство
    await prisma.userDevice.delete({
      where: { deviceId },
    });

    res.json({ success: true, message: 'Device logged out' });
  } catch (error) {
    console.error('Error logging out device:', error);
    res.status(500).json({ error: 'Failed to logout device' });
  }
});

// Завершить все сессии кроме текущей
router.post('/terminate-all', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const rawDeviceHeader = req.headers['x-device-id'];
    const currentDeviceId = Array.isArray(rawDeviceHeader) ? rawDeviceHeader[0] : rawDeviceHeader;

    const result = await prisma.userDevice.deleteMany({
      where: {
        userId: authReq.userId,
        NOT: { deviceId: currentDeviceId || '' },
      },
    });

    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Error terminating all devices:', error);
    res.status(500).json({ error: 'Failed to terminate all devices' });
  }
});

// Обновить информацию об устройстве (вызывается при каждом подключении)
router.post('/update', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const {
      deviceId,
      deviceName,
      deviceType,
      platform,
      identityKey,
      signedPreKey,
      preKeyId,
    } = req.body;

    if (!deviceId || !deviceName || !deviceType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Получаем IP и User Agent
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    // Обновляем или создаём устройство
    const device = await prisma.userDevice.upsert({
      where: { deviceId },
      update: {
        deviceName,
        deviceType,
        platform,
        ipAddress,
        userAgent,
        lastActive: new Date(),
      },
      create: {
        userId: authReq.userId,
        deviceId,
        deviceName,
        deviceType,
        platform,
        ipAddress,
        userAgent,
        identityKey: identityKey || '',
        signedPreKey: signedPreKey || '',
        preKeyId: preKeyId || 0,
      },
    });

    res.json({ success: true, device });
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

export default router;

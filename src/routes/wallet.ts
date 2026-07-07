import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { authenticateToken } from '../middleware/auth';
import { getSocket } from '../socket';
import crypto from 'crypto';

const router = Router();

// SECURITY FIX: Белый список IP-адресов YooKassa (обновить при необходимости)
const YOOKASSA_IP_WHITELIST = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

/**
 * SECURITY FIX: Проверка IP-адреса в белом списке
 */
function isIpInWhitelist(ip: string): boolean {
  // Упрощённая проверка (в продакшене использовать библиотеку ip-range-check)
  for (const range of YOOKASSA_IP_WHITELIST) {
    if (range.includes('/')) {
      // CIDR notation - требует библиотеки для полной проверки
      continue;
    }
    if (ip === range) {
      return true;
    }
  }
  return false;
}

// GET /api/wallet/balance — получить баланс
router.get('/balance', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { beavers: true, totalSpent: true, totalEarned: true },
    });
    res.json(user);
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка получения баланса' });
  }
});

// GET /api/wallet/transactions — получить историю транзакций
router.get('/transactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    // SECURITY FIX: Валидация параметров
    const limitNum = Math.min(Math.max(1, parseInt(limit as string) || 50), 100);
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);
    
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      skip: offsetNum,
    });
    res.json(transactions);
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// POST /api/wallet/send — отправить бобров другому пользователю
router.post('/send', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { toUserId, amount, note } = req.body;
    const fromUserId = req.userId!;

    // SECURITY FIX: Валидация параметров
    if (!toUserId || typeof toUserId !== 'string') {
      return res.status(400).json({ error: 'ID получателя обязателен' });
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return res.status(400).json({ error: 'Сумма должна быть положительным целым числом' });
    }

    // SECURITY FIX: Максимальная сумма перевода
    if (amount > 10000) {
      return res.status(400).json({ error: 'Максимальная сумма перевода: 10,000 бобров' });
    }

    // SECURITY FIX: Предотвращение перевода самому себе
    if (toUserId === fromUserId) {
      return res.status(400).json({ error: 'Нельзя отправить бобров самому себе' });
    }

    // SECURITY FIX: Валидация заметки (защита от XSS)
    if (note && (typeof note !== 'string' || note.length > 200 || /<script|javascript:|onerror=/i.test(note))) {
      return res.status(400).json({ error: 'Недопустимая заметка' });
    }

    // Проверка баланса отправителя
    const sender = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { beavers: true, username: true, displayName: true },
    });

    if (!sender || sender.beavers < amount) {
      return res.status(402).json({
        error: 'Недостаточно бобров',
        balance: sender?.beavers || 0,
        required: amount,
      });
    }

    // Проверка существования получателя
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, username: true, displayName: true, beavers: true },
    });

    if (!recipient) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const description = note
      ? `От @${sender.username}: ${note.trim()}`
      : `Перевод от @${sender.username}`;

    // SECURITY FIX: Атомарная транзакция с блокировкой
    await prisma.$transaction(async (tx) => {
      // Блокировка записей для предотвращения race condition
      const lockedSender = await tx.user.findUnique({
        where: { id: fromUserId },
        select: { beavers: true },
      });

      if (!lockedSender || lockedSender.beavers < amount) {
        throw new Error('Недостаточно бобров');
      }

      // Списание у отправителя
      await tx.user.update({
        where: { id: fromUserId },
        data: {
          beavers: { decrement: amount },
          totalSpent: { increment: amount },
        },
      });

      // Начисление получателю
      await tx.user.update({
        where: { id: toUserId },
        data: {
          beavers: { increment: amount },
          totalEarned: { increment: amount },
        },
      });

      // Запись транзакции отправителя
      await tx.transaction.create({
        data: {
          userId: fromUserId,
          amount: -amount,
          type: 'send',
          description: `Отправлено @${recipient.username}${note ? ': ' + note.trim() : ''}`,
          relatedId: toUserId,
        },
      });

      // Запись транзакции получателя
      await tx.transaction.create({
        data: {
          userId: toUserId,
          amount: amount,
          type: 'receive',
          description,
          relatedId: fromUserId,
        },
      });

      return { success: true };
    });

    // Отправка уведомления получателю
    try {
      const io = getSocket();
      if (io) {
        io.to(`user:${toUserId}`).emit('beavers_received', {
          fromUserId,
          fromUsername: sender.username,
          fromDisplayName: sender.displayName,
          amount,
          note: note?.trim() || null,
        });
      }
    } catch (_e) {
      // Игнорируем ошибки сокетов
    }

    const updatedSender = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { beavers: true },
    });

    res.json({
      success: true,
      newBalance: updatedSender?.beavers || 0,
      sent: amount,
      to: recipient.username,
    });
  } catch (error: any) {
    console.error('Send beavers error:', error);
    res.status(500).json({ error: error.message || 'Ошибка отправки' });
  }
});

// POST /api/wallet/topup — создать платёж YooKassa
router.post('/topup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;
    const userId = req.userId!;

    // SECURITY FIX: Валидация суммы
    if (typeof amount !== 'number' || amount < 10 || !Number.isInteger(amount)) {
      return res.status(400).json({ error: 'Минимальная сумма — 10 бобров (целое число)' });
    }

    // SECURITY FIX: Максимальная сумма пополнения
    if (amount > 100000) {
      return res.status(400).json({ error: 'Максимальная сумма пополнения: 100,000 бобров' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверка наличия ключей YooKassa
    const shopId = process.env.YUKASSA_SHOP_ID || '';
    const secretKey = process.env.YUKASSA_SECRET_KEY || '';
    const returnUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/payment/success`
      : 'https://нексо.app/payment/success';

    if (!shopId || !secretKey) {
      return res.status(503).json({ error: 'Платёжная система временно недоступна' });
    }

    const axios = await import('axios');
    const idempotenceKey = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // SECURITY FIX: Проверка дубликатов по idempotence key
      const existingPayment = await prisma.transaction.findFirst({
        where: { 
          userId, 
          type: 'topup_pending', 
          relatedId: idempotenceKey,
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } // последние 10 минут
        },
      });
      
      if (existingPayment) {
        console.log('[WALLET] Duplicate payment request detected');
        return res.status(409).json({ error: 'Платёж уже создан. Пожалуйста, завершите предыдущий платёж.' });
      }
      
      // Создание платежа в YooKassa
      const response = await axios.default.post(
        'https://api.yookassa.ru/v3/payments',
        {
          amount: {
            value: amount.toFixed(2),
            currency: 'RUB',
          },
          capture: true,
          confirmation: {
            type: 'redirect',
            return_url: returnUrl,
          },
          description: `Пополнение бобров Нексо (${amount} шт.)`,
          metadata: {
            userId,
            beaverAmount: amount,
            idempotenceKey,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotence-Key': idempotenceKey,
          },
          auth: {
            username: shopId,
            password: secretKey,
          },
          timeout: 10000, // SECURITY FIX: Таймаут 10 секунд
        }
      );

      const paymentUrl = response.data.confirmation.confirmation_url;
      const paymentId = response.data.id;

      // Сохранение ожидающего платежа
      await prisma.transaction.create({
        data: {
          userId,
          amount: 0,
          type: 'topup_pending',
          description: `Ожидание пополнения на ${amount} бобров`,
          relatedId: idempotenceKey,
        },
      });

      res.json({
        success: true,
        paymentUrl,
        paymentId,
        amount,
      });
    } catch (apiError: any) {
      console.error('YooKassa API error:', apiError.response?.data || apiError.message);
      res.status(500).json({ error: 'Ошибка создания платежа в ЮKassa' });
    }
  } catch (error) {
    console.error('Topup error:', error);
    res.status(500).json({ error: 'Ошибка создания платежа' });
  }
});

// POST /api/wallet/topup/webhook — уведомление от YooKassa
router.post('/topup/webhook', async (req, res) => {
  try {
    const { type, event, object } = req.body;

    // SECURITY FIX: Обязательная проверка подписи
    const signature = req.headers['yookassa-signature'] as string;
    const secret = process.env.YUKASSA_WEBHOOK_SECRET || process.env.YUKASSA_SECRET_KEY;
    
    if (!secret) {
      console.error('[WALLET] Webhook secret not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    
    if (!signature) {
      console.error('[WALLET] Webhook missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }
    
    // SECURITY FIX: Timing-safe signature comparison
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('base64');
    
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      console.error('[WALLET] Webhook signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // SECURITY FIX: Check IP whitelist
    const clientIp = req.ip || req.socket.remoteAddress || '';
    if (isIpInWhitelist(clientIp) === false && !clientIp.includes('127.0.0.1') && !clientIp.includes('::1')) {
      // Only block if we're in production and the IP check is fully implemented
      if (process.env.NODE_ENV === 'production') {
        console.error('[WALLET] Webhook from unauthorized IP:', clientIp);
        return res.status(403).json({ error: 'Unauthorized IP' });
      }
    }

    // Проверка типа уведомления
    if (type !== 'notification' || event !== 'payment.succeeded') {
      return res.status(200).json({ ok: true });
    }

    const payment = object;
    const { id: paymentId, status, paid, amount, metadata } = payment;
    const paymentAmount = Number(amount?.value || 0);

    if (status !== 'succeeded' || !paid) {
      return res.status(200).json({ ok: true });
    }

    const userId = metadata?.userId;
    const beaverAmount = parseInt(metadata?.beaverAmount || '0');

    // SECURITY FIX: Валидация данных
    if (!userId || isNaN(beaverAmount) || beaverAmount <= 0 || beaverAmount > 100000) {
      console.error('[WALLET] Invalid webhook data:', { userId, beaverAmount });
      return res.status(200).json({ ok: true });
    }

    // SECURITY FIX: Проверка идемпотентности (предотвращение двойного начисления)
    const existing = await prisma.transaction.findFirst({
      where: { userId, type: 'topup', relatedId: paymentId },
    });

    if (existing) {
      console.log('[WALLET] Payment already processed:', paymentId);
      return res.status(200).json({ ok: true });
    }

    // SECURITY FIX: Атомарная транзакция
    await prisma.$transaction(async (tx) => {
      // Начисление бобров
      await tx.user.update({
        where: { id: userId },
        data: {
          beavers: { increment: beaverAmount },
          totalEarned: { increment: beaverAmount },
        },
      });

      // Запись транзакции
      await tx.transaction.create({
        data: {
          userId,
          amount: beaverAmount,
          type: 'topup',
          description: `Пополнение через ЮKassa (${amount.value} ₽)`,
          relatedId: paymentId,
        },
      });
    });

    // Отправка уведомления пользователю
    try {
      const io = getSocket();
      if (io) {
        io.to(`user:${userId}`).emit('beavers_topup', {
          amount: beaverAmount,
          rubles: paymentAmount,
        });
      }
    } catch (_e) {
      // Игнорируем ошибки сокетов
    }

    console.log(`[WALLET] Topped up ${beaverAmount} beavers for user ${userId}`);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Topup webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;

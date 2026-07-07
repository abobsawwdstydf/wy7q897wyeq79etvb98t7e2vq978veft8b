import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

/**
 * POST /api/invoices - Создать счёт
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { chatId, amount, description } = req.body;

    if (!chatId || !amount || amount <= 0) {
      res.status(400).json({ error: 'chatId и amount обязательны' });
      return;
    }

    // Проверяем доступ к чату
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к чату' });
      return;
    }

    // Создаём счёт (Invoice: chatId, creatorId, amount, description, status, paidBy, paidAt)
    const invoice = await prisma.invoice.create({
      data: {
        chatId,
        creatorId: req.userId!,
        amount,
        description: description || '',
        status: 'pending',
      },
    });

    // Получаем инфо о создателе
    const creator = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, username: true, displayName: true, avatar: true },
    });

    // Отправляем сообщение в чат
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: req.userId!,
        content: `💳 Счёт на оплату: ${amount} бобров\n${description || 'Без описания'}`,
        type: 'invoice',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isVerified: true,
            verifiedBadgeUrl: true,
            verifiedBadgeType: true,
          },
        },
        media: true,
      },
    });

    // Отправляем через socket
    const io = getIO();
    io.to(`chat:${chatId}`).emit('new_message', message);

    res.json({ ...invoice, fromUser: creator });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Ошибка создания счёта' });
  }
});

/**
 * POST /api/invoices/:id/pay - Оплатить счёт
 */
router.post('/:id/pay', async (req: AuthRequest, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      res.status(404).json({ error: 'Счёт не найден' });
      return;
    }

    if (invoice.status !== 'pending') {
      res.status(400).json({ error: 'Счёт уже оплачен или отменён' });
      return;
    }

    // Проверяем баланс
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { beavers: true, displayName: true, username: true },
    });

    if (!user || (user.beavers || 0) < invoice.amount) {
      res.status(400).json({ error: 'Недостаточно бобров' });
      return;
    }

    // Транзакция оплаты
    await prisma.$transaction(async (tx) => {
      // Списываем у плательщика
      await tx.user.update({
        where: { id: req.userId! },
        data: { beavers: { decrement: invoice.amount } },
      });

      // Начисляем получателю (создателю счёта)
      await tx.user.update({
        where: { id: invoice.creatorId },
        data: { beavers: { increment: invoice.amount } },
      });

      // Обновляем статус счёта (paidBy это просто ID строкой, не relation)
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidBy: req.userId!,
          paidAt: new Date(),
        },
      });

      // Создаём транзакции в истории
      await tx.transaction.createMany({
        data: [
          {
            userId: req.userId!,
            amount: -invoice.amount,
            type: 'invoice_payment',
            description: `Оплата счёта: ${invoice.description || 'Без описания'}`,
            relatedId: invoiceId,
          },
          {
            userId: invoice.creatorId,
            amount: invoice.amount,
            type: 'invoice_received',
            description: `Получен платёж по счёту: ${invoice.description || 'Без описания'}`,
            relatedId: invoiceId,
          },
        ],
      });
    });

    // Уведомляем через socket
    const io = getIO();
    io.to(`user:${invoice.creatorId}`).emit('beavers_received', {
      fromDisplayName: user.displayName || req.userId,
      fromUsername: user.username || req.userId,
      amount: invoice.amount,
      note: `Оплата счёта: ${invoice.description || ''}`,
    });

    res.json({ success: true, message: 'Счёт оплачен' });
  } catch (error) {
    console.error('Pay invoice error:', error);
    res.status(500).json({ error: 'Ошибка оплаты счёта' });
  }
});

/**
 * GET /api/invoices/:id - Получить информацию о счёте
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });

    if (!invoice) {
      res.status(404).json({ error: 'Счёт не найден' });
      return;
    }

    // Подтягиваем инфу о создателе и плательщике по id-полям
    const userIds = [invoice.creatorId, invoice.paidBy].filter(Boolean) as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    res.json({
      ...invoice,
      fromUser: userMap.get(invoice.creatorId) || null,
      paidByUser: invoice.paidBy ? userMap.get(invoice.paidBy) || null : null,
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Ошибка получения счёта' });
  }
});

export default router;

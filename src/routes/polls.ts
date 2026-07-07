import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Создать опрос
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { chatId, question, options, allowMultiple, isAnonymous, duration } = req.body;
    const userId = req.userId!;

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ error: 'Invalid poll data' });
    }

    // Проверяем доступ к чату
    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });

    if (!member || !member.canPost) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Создаём сообщение с опросом
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        type: 'poll',
        content: question
      }
    });

    // Создаём опрос
    let endsAt: Date | null = null;
    if (duration && duration > 0) {
      endsAt = new Date(Date.now() + duration * 60 * 1000);
    }

    const poll = await prisma.poll.create({
      data: {
        messageId: message.id,
        question,
        allowMultiple: allowMultiple || false,
        isAnonymous: isAnonymous || false,
        endsAt,
        options: {
          create: options.map((text: string) => ({ text }))
        }
      },
      include: {
        options: true
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`chat:${chatId}`).emit('message:new', {
      ...message,
      poll
    });

    res.json({ message, poll });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Проголосовать
router.post('/:pollId/vote', auth, async (req: AuthRequest, res) => {
  try {
    const { pollId } = req.params;
    const { optionIds } = req.body; // Массив ID опций
    const userId = req.userId!;

    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return res.status(400).json({ error: 'Invalid option IDs' });
    }

    // Получаем опрос
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: true
      }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Проверяем не истёк ли опрос
    if (poll.endsAt && poll.endsAt < new Date()) {
      return res.status(400).json({ error: 'Poll has ended' });
    }

    // Проверяем множественный выбор
    if (!poll.allowMultiple && optionIds.length > 1) {
      return res.status(400).json({ error: 'Multiple votes not allowed' });
    }

    // Проверяем доступ к чату
    const message = await prisma.message.findUnique({
      where: { id: poll.messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: message.chatId,
          userId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Удаляем старые голоса если не множественный выбор
    if (!poll.allowMultiple) {
      await prisma.pollVote.deleteMany({
        where: {
          optionId: { in: poll.options.map(o => o.id) },
          userId
        }
      });
    }

    // Добавляем новые голоса
    await Promise.all(
      optionIds.map((optionId: string) =>
        prisma.pollVote.upsert({
          where: {
            optionId_userId: {
              optionId,
              userId
            }
          },
          create: {
            optionId,
            userId
          },
          update: {}
        })
      )
    );

    // Получаем обновлённые результаты
    const updatedPoll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: true
      }
    });

    // Подтягиваем инфу о голосующих (только если не анонимный)
    let userMap = new Map<string, any>();
    if (updatedPoll && !updatedPoll.isAnonymous) {
      const userIds = [...new Set(
        (await prisma.pollVote.findMany({ where: { option: { pollId } } })).map(v => v.userId)
      )];
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, displayName: true, avatar: true }
          })
        : [];
      userMap = new Map(users.map(u => [u.id, u]));
    }

    // Собираем ответ
    const result = {
      ...(updatedPoll || poll),
      options: (updatedPoll?.options || poll.options).map(o => ({ ...o, votes: [] })),
    };

    // Отправляем Socket событие
    const io = getIO();
    io.to(message.chatId).emit('poll:new_vote', {
      pollId,
      userId: poll.isAnonymous ? null : userId,
      poll: result
    });

    res.json(result);
  } catch (error) {
    console.error('Error voting in poll:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// Отменить голос
router.delete('/:pollId/vote', auth, async (req: AuthRequest, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.userId!;

    // Получаем опрос
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Удаляем все голоса пользователя
    await prisma.pollVote.deleteMany({
      where: {
        optionId: { in: poll.options.map(o => o.id) },
        userId
      }
    });

    // Получаем обновлённые результаты
    const updatedPoll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true }
    });

    // Отправляем Socket событие
    const message = await prisma.message.findUnique({
      where: { id: poll.messageId }
    });

    if (message) {
      const io = getIO();
      io.to(message.chatId).emit('poll:vote_removed', {
        pollId,
        userId: poll.isAnonymous ? null : userId,
        poll: updatedPoll
      });
    }

    res.json(updatedPoll);
  } catch (error) {
    console.error('Error removing vote:', error);
    res.status(500).json({ error: 'Failed to remove vote' });
  }
});

// Получить результаты опроса
router.get('/:pollId/results', auth, async (req: AuthRequest, res) => {
  try {
    const { pollId } = req.params;
    const userId = req.userId!;

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          include: {
            votes: {
              select: { id: true, createdAt: true, userId: true }
            }
          }
        }
      }
    });

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    // Проверяем доступ
    const message = await prisma.message.findUnique({
      where: { id: poll.messageId }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const member = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: message.chatId,
          userId
        }
      }
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Подтягиваем инфу о пользователях для неанонимных опросов
    let userMap = new Map<string, any>();
    if (!poll.isAnonymous) {
      const userIds = [...new Set(poll.options.flatMap(o => o.votes.map(v => v.userId)))];
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, displayName: true, avatar: true }
          })
        : [];
      userMap = new Map(users.map(u => [u.id, u]));
    }

    // Подсчитываем статистику
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const results = poll.options.map(option => ({
      ...option,
      voteCount: option.votes.length,
      percentage: totalVotes > 0 ? (option.votes.length / totalVotes) * 100 : 0,
      votes: poll.isAnonymous
        ? option.votes.map(v => ({ id: v.id, createdAt: v.createdAt }))
        : option.votes.map(v => ({ ...v, user: userMap.get(v.userId) || null }))
    }));

    res.json({
      ...poll,
      options: results,
      totalVotes
    });
  } catch (error) {
    console.error('Error fetching poll results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

export default router;

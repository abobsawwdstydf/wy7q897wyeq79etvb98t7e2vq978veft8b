import { Router } from 'express';
import { prisma } from '../db';
import { auth, AuthRequest } from '../middleware/auth';
import { getIO } from '../socket';

const router = Router();

// Получить список комнат
router.get('/', auth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { isPublic } = req.query;

    const rooms = await prisma.voiceRoom.findMany({
      where: isPublic !== undefined ? { isPublic: isPublic === 'true' } : {},
      include: {
        participants: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Подтягиваем пользователей-участников
    const userIds = [...new Set(rooms.flatMap(r => r.participants.map(p => p.userId)))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true }
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const roomsWithUsers = rooms.map(r => ({
      ...r,
      participants: r.participants.map(p => ({
        ...p,
        user: userMap.get(p.userId) || null
      }))
    }));

    // Фильтруем приватные комнаты (показываем только те, где пользователь участник или владелец)
    const filteredRooms = roomsWithUsers.filter(room => {
      if (room.isPublic) return true;
      if (room.ownerId === userId) return true;
      return room.participants.some(p => p.userId === userId);
    });

    res.json(filteredRooms);
  } catch (error) {
    console.error('Error fetching voice rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Создать комнату
router.post('/', auth, async (req: AuthRequest, res) => {
  try {
    const { name, description, chatId, maxUsers, isPublic, password } = req.body;
    const userId = req.userId!;

    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'Invalid room name' });
    }

    // Если привязана к чату, проверяем права
    if (chatId) {
      const member = await prisma.chatMember.findUnique({
        where: {
          chatId_userId: {
            chatId,
            userId
          }
        }
      });

      if (!member || member.role === 'member') {
        return res.status(403).json({ error: 'Only admins can create chat rooms' });
      }
    }

    const room = await prisma.voiceRoom.create({
      data: {
        name,
        description,
        ownerId: userId,
        chatId,
        maxUsers: maxUsers || 50,
        isPublic: isPublic !== false,
        password: password || null
      }
    });

    // Автоматически добавляем создателя как участника
    await prisma.voiceRoomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        isSpeaker: true
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.emit('voice:room_created', room);

    res.json(room);
  } catch (error) {
    console.error('Error creating voice room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Войти в комнату
router.post('/:roomId/join', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;
    const userId = req.userId!;

    const room = await prisma.voiceRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: true
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Проверяем пароль для приватных комнат
    if (!room.isPublic && room.password && room.password !== password) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Проверяем лимит участников
    if (room.participants.length >= room.maxUsers) {
      return res.status(400).json({ error: 'Room is full' });
    }

    // Добавляем участника
    const participant = await prisma.voiceRoomParticipant.upsert({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      create: {
        roomId,
        userId,
        isSpeaker: true
      },
      update: {
        joinedAt: new Date()
      }
    });

    // Подтягиваем пользователя
    const participantUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatar: true }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:user_joined', {
      roomId,
      participant: { ...participant, user: participantUser }
    });

    res.json({ ...participant, user: participantUser });
  } catch (error) {
    console.error('Error joining voice room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Выйти из комнаты
router.post('/:roomId/leave', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId!;

    await prisma.voiceRoomParticipant.delete({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:user_left', {
      roomId,
      userId
    });

    // Проверяем, остались ли участники
    const participants = await prisma.voiceRoomParticipant.count({
      where: { roomId }
    });

    // Если комната пустая, удаляем её
    if (participants === 0) {
      await prisma.voiceRoom.delete({
        where: { id: roomId }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving voice room:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Замутить/размутить
router.post('/:roomId/mute', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const { isMuted } = req.body;
    const userId = req.userId!;

    const participant = await prisma.voiceRoomParticipant.update({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      data: {
        isMuted: isMuted !== false
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:user_muted', {
      roomId,
      userId,
      isMuted: participant.isMuted
    });

    res.json(participant);
  } catch (error) {
    console.error('Error muting user:', error);
    res.status(500).json({ error: 'Failed to mute' });
  }
});

// Дать/забрать право говорить (только владелец)
router.post('/:roomId/speaker', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const { targetUserId, isSpeaker } = req.body;
    const userId = req.userId!;

    // Проверяем что пользователь - владелец комнаты
    const room = await prisma.voiceRoom.findUnique({
      where: { id: roomId }
    });

    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only room owner can manage speakers' });
    }

    const participant = await prisma.voiceRoomParticipant.update({
      where: {
        roomId_userId: {
          roomId,
          userId: targetUserId
        }
      },
      data: {
        isSpeaker: isSpeaker !== false
      }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:speaker_changed', {
      roomId,
      userId: targetUserId,
      isSpeaker: participant.isSpeaker
    });

    res.json(participant);
  } catch (error) {
    console.error('Error changing speaker status:', error);
    res.status(500).json({ error: 'Failed to change speaker status' });
  }
});

// Удалить комнату (только владелец)
router.delete('/:roomId', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId!;

    const room = await prisma.voiceRoom.findUnique({
      where: { id: roomId }
    });

    if (!room || room.ownerId !== userId) {
      return res.status(403).json({ error: 'Only room owner can delete room' });
    }

    await prisma.voiceRoom.delete({
      where: { id: roomId }
    });

    // Отправляем Socket событие
    const io = getIO();
    io.to(`voice:${roomId}`).emit('voice:room_deleted', { roomId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting voice room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Получить детали комнаты
router.get('/:roomId', auth, async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId!;

    const room = await prisma.voiceRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: true
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Подтягиваем пользователей
    const userIds = [...new Set(room.participants.map(p => p.userId))];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatar: true, isOnline: true }
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const roomWithUsers = {
      ...room,
      participants: room.participants.map(p => ({
        ...p,
        user: userMap.get(p.userId) || null
      }))
    };

    // Проверяем доступ к приватной комнате
    if (!room.isPublic && room.ownerId !== userId) {
      const isParticipant = room.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(roomWithUsers);
  } catch (error) {
    console.error('Error fetching voice room:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

export default router;

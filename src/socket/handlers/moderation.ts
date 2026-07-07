import { Server } from 'socket.io';
import { prisma } from '../../db';
import { AuthSocket, isChatMember } from '../shared';

/**
 * Moderation socket handlers — ban_user, unban_user, mute_user, unmute_user, kick_user, slow_mode.
 */
export function setupModerationHandlers(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  // ── Ban user (kick from chat — no re-join tracking) ─────────────
  socket.on('ban_user', async (data: { chatId: string; targetUserId: string; reason?: string; duration?: number }) => {
    try {
      const { chatId, targetUserId, reason } = data;
      if (!chatId || !targetUserId) return socket.emit('error', { message: 'chatId и targetUserId обязательны' });

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });
      if (!member || (member.role !== 'admin' && member.role !== 'moderator')) {
        return socket.emit('error', { message: 'Нет прав модератора' });
      }

      const targetMember = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });
      if (!targetMember) return socket.emit('error', { message: 'Пользователь не в чате' });
      if (targetMember.role === 'admin') return socket.emit('error', { message: 'Нельзя забанить админа' });

      // Ban = kick (remove from chat)
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });

      io.to(`chat:${chatId}`).emit('user_banned', {
        chatId,
        targetUserId,
        bannedBy: userId,
        reason: reason || null,
      });

      const targetSockets = io.sockets.sockets;
      for (const [, s] of targetSockets) {
        if ((s as AuthSocket).userId === targetUserId) {
          s.emit('kicked', { chatId, reason: `Заблокирован${reason ? ': ' + reason : ''}` });
          s.leave(`chat:${chatId}`);
        }
      }
    } catch (err) {
      console.error('[Moderation] ban_user error:', err);
      socket.emit('error', { message: 'Ошибка при бане' });
    }
  });

  // ── Unban user (no-op since ban = kick) ────────────────────────
  socket.on('unban_user', async (data: { chatId: string; targetUserId: string }) => {
    try {
      const { chatId, targetUserId } = data;
      if (!chatId || !targetUserId) return socket.emit('error', { message: 'chatId и targetUserId обязательны' });

      // Ban = kick, so unban means user must be re-invited
      socket.emit('info', { message: 'Пользователь был удалён из чата. Пригласите его заново.' });
      io.to(`chat:${chatId}`).emit('user_unbanned', { chatId, targetUserId, unbannedBy: userId });
    } catch (err) {
      console.error('[Moderation] unban_user error:', err);
      socket.emit('error', { message: 'Ошибка при разбане' });
    }
  });

  // ── Mute user ───────────────────────────────────────────────────
  socket.on('mute_user', async (data: { chatId: string; targetUserId: string; duration?: number }) => {
    try {
      const { chatId, targetUserId } = data;
      if (!chatId || !targetUserId) return socket.emit('error', { message: 'chatId и targetUserId обязательны' });

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });
      if (!member || (member.role !== 'admin' && member.role !== 'moderator')) {
        return socket.emit('error', { message: 'Нет прав модератора' });
      }

      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: targetUserId } },
        data: { isMuted: true },
      });

      io.to(`chat:${chatId}`).emit('user_muted', {
        chatId,
        targetUserId,
        mutedBy: userId,
      });
    } catch (err) {
      console.error('[Moderation] mute_user error:', err);
      socket.emit('error', { message: 'Ошибка при муте' });
    }
  });

  // ── Unmute user ─────────────────────────────────────────────────
  socket.on('unmute_user', async (data: { chatId: string; targetUserId: string }) => {
    try {
      const { chatId, targetUserId } = data;
      if (!chatId || !targetUserId) return socket.emit('error', { message: 'chatId и targetUserId обязательны' });

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });
      if (!member || (member.role !== 'admin' && member.role !== 'moderator')) {
        return socket.emit('error', { message: 'Нет прав модератора' });
      }

      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId: targetUserId } },
        data: { isMuted: false },
      });

      io.to(`chat:${chatId}`).emit('user_unmuted', { chatId, targetUserId, unmutedBy: userId });
    } catch (err) {
      console.error('[Moderation] unmute_user error:', err);
      socket.emit('error', { message: 'Ошибка при unmute' });
    }
  });

  // ── Kick user ───────────────────────────────────────────────────
  socket.on('kick_user', async (data: { chatId: string; targetUserId: string; reason?: string }) => {
    try {
      const { chatId, targetUserId, reason } = data;
      if (!chatId || !targetUserId) return socket.emit('error', { message: 'chatId и targetUserId обязательны' });

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });
      if (!member || (member.role !== 'admin' && member.role !== 'moderator')) {
        return socket.emit('error', { message: 'Нет прав модератора' });
      }

      const targetMember = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });
      if (!targetMember) return socket.emit('error', { message: 'Пользователь не в чате' });
      if (targetMember.role === 'admin') return socket.emit('error', { message: 'Нельзя кикнуть админа' });

      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId: targetUserId } },
      });

      io.to(`chat:${chatId}`).emit('user_kicked', {
        chatId,
        targetUserId,
        kickedBy: userId,
        reason: reason || null,
      });

      const targetSockets = io.sockets.sockets;
      for (const [, s] of targetSockets) {
        if ((s as AuthSocket).userId === targetUserId) {
          s.emit('kicked', { chatId, reason: reason || 'Вы удалены из чата' });
          s.leave(`chat:${chatId}`);
        }
      }
    } catch (err) {
      console.error('[Moderation] kick_user error:', err);
      socket.emit('error', { message: 'Ошибка при кике' });
    }
  });

  // ── Slow mode ───────────────────────────────────────────────────
  socket.on('slow_mode', async (data: { chatId: string; interval: number }) => {
    try {
      const { chatId, interval } = data;
      if (!chatId) return socket.emit('error', { message: 'chatId обязателен' });

      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });
      if (!member || member.role !== 'admin') {
        return socket.emit('error', { message: 'Только админ может менять slow mode' });
      }

      const safeInterval = Math.max(0, Math.min(300, Math.floor(Number(interval) || 0)));

      await prisma.chat.update({
        where: { id: chatId },
        data: { slowModeInterval: safeInterval },
      });

      io.to(`chat:${chatId}`).emit('slow_mode_changed', {
        chatId,
        interval: safeInterval,
        changedBy: userId,
      });
    } catch (err) {
      console.error('[Moderation] slow_mode error:', err);
      socket.emit('error', { message: 'Ошибка при установке slow mode' });
    }
  });
}

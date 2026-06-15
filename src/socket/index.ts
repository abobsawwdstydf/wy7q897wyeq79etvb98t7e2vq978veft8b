import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { config } from '../config';
import { SENDER_SELECT } from '../shared';

import {
  AuthSocket,
  setSocket,
  MAX_TIMEOUT,
} from './shared';
import { setupMessageHandlers } from './handlers/messages';
import { setupCallHandlers } from './handlers/calls';
import { setupTypingHandlers } from './handlers/typing';
import { handlePresenceConnect, handlePresenceDisconnect } from './handlers/presence';
import { setupModerationHandlers } from './handlers/moderation';
import { setupMiscHandlers } from './handlers/misc';

export { getSocket, getIO, setSocket } from './shared';

export function setupSocket(io: Server) {
  setSocket(io);
  rescheduleMessages(io);

  io.use((socket: AuthSocket, next) => {
    // Support token from auth handshake OR from httpOnly cookie
    let token = socket.handshake.auth.token;
    
    // If no token in handshake, try to extract from cookies in handshake headers
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
        const [key, ...val] = c.trim().split('=');
        acc[key] = val.join('=');
        return acc;
      }, {} as Record<string, string>);
      token = cookies['nexo_access_token'];
    }
    
    if (!token) return next(new Error('Требуется авторизация'));

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Недействительный токен'));
    }
  });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`Пользователь подключился: ${userId}`);

    // Check if user is banned
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isBanned: true, banExpiresAt: true },
      });

      if (user?.isBanned) {
        if (user.banExpiresAt && user.banExpiresAt < new Date()) {
          await prisma.user.update({
            where: { id: userId },
            data: { isBanned: false, banReason: null, banExpiresAt: null, bannedAt: null, bannedBy: null },
          });
        } else {
          socket.emit('banned', { message: 'Ваш аккаунт заблокирован' });
          socket.disconnect(true);
          return;
        }
      }
    } catch (e) {
      console.error('Socket: failed to check ban status:', e);
    }

    // Presence (online tracking, room joins)
    handlePresenceConnect(io, socket);

    // Setup all event handlers
    setupMessageHandlers(io, socket);
    setupTypingHandlers(io, socket);
    setupCallHandlers(io, socket);
    setupModerationHandlers(io, socket);
    setupMiscHandlers(io, socket);

    // Disconnect (presence cleanup)
    socket.on('disconnect', () => handlePresenceDisconnect(io, socket));
  });
}

async function rescheduleMessages(io: Server) {
  try {
    const scheduled = await prisma.message.findMany({
      where: {
        scheduledAt: { not: null },
      },
      include: {
        sender: { select: SENDER_SELECT },
        forwardedFrom: { select: SENDER_SELECT },
        replyTo: {
          include: { sender: { select: { id: true, username: true, displayName: true } } },
        },
        media: true,
        reactions: true,
        readBy: true,
      },
    });

    for (let i = 0; i < scheduled.length; i++) {
      const msg = scheduled[i];
      const rawDelay = new Date(msg.scheduledAt!).getTime() - Date.now();
      const delay = Math.min(Math.max(i * 100, rawDelay), MAX_TIMEOUT);
      setTimeout(async () => {
        try {
          const current = await prisma.message.findUnique({ where: { id: msg.id } });
          if (!current || current.isDeleted) return;

          await prisma.message.update({
            where: { id: msg.id },
            data: { scheduledAt: null },
          });

          await prisma.readReceipt.upsert({
            where: { messageId_userId: { messageId: msg.id, userId: msg.senderId } },
            create: { messageId: msg.id, userId: msg.senderId },
            update: {},
          });

          const updated = await prisma.message.findUnique({
            where: { id: msg.id },
            include: {
              sender: { select: SENDER_SELECT },
              forwardedFrom: { select: SENDER_SELECT },
              replyTo: {
                include: { sender: { select: { id: true, username: true, displayName: true } } },
              },
              media: true,
              reactions: true,
              readBy: true,
            },
          });

          if (updated) {
            io.to(`chat:${msg.chatId}`).emit('scheduled_delivered', {
              ...updated,
              readBy: updated.readBy.map(r => ({ userId: r.userId })),
            });
          }
        } catch (err) {
          console.error('Scheduled delivery error:', err);
        }
      }, delay);
    }

    if (scheduled.length > 0) {
      console.log(`  ✔ ${scheduled.length} scheduled message(s) re-armed`);
    }
  } catch (err) {
    console.error('Error rescheduling messages:', err);
  }
}

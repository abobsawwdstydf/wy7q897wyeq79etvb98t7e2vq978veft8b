import { Server } from 'socket.io';
import { prisma } from '../../db';
import { AuthSocket, onlineUsers, activeGroupCalls, typingTimeouts } from '../shared';

export function handlePresenceConnect(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  socket.join(`user:${userId}`);

  // Update DB and broadcast online status
  (async () => {
    try {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (userExists) {
        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: true, lastSeen: new Date() },
        });
        socket.broadcast.emit('user_online', { userId });
      }
    } catch (e) {
      console.error('Socket: failed to update user online status:', e);
    }
  })();

  // Join all user chat rooms
  (async () => {
    try {
      const userChats = await prisma.chatMember.findMany({
        where: { userId },
        select: { chatId: true },
      });

      for (const { chatId } of userChats) {
        socket.join(`chat:${chatId}`);
      }
    } catch (e) {
      console.error('Socket: failed to join chats:', e);
    }
  })();
}

export function handlePresenceDisconnect(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;
  console.log(`Пользователь отключился: ${userId}`);

  // Clear typing timeouts for this user
  for (const [key, timeout] of typingTimeouts) {
    if (key.endsWith(`:${userId}`)) {
      clearTimeout(timeout);
      typingTimeouts.delete(key);
    }
  }

  // Remove from active group calls
  for (const [chatId, participants] of activeGroupCalls) {
    if (participants.has(userId)) {
      participants.delete(userId);
      for (const pid of participants) {
        const pSockets = onlineUsers.get(pid);
        if (pSockets) {
          for (const sid of pSockets) {
            io.to(sid).emit('group_call_user_left', { chatId, userId });
          }
        }
      }
      if (participants.size === 0) {
        activeGroupCalls.delete(chatId);
      }
      io.to(`chat:${chatId}`).emit('group_call_active', {
        chatId,
        participants: participants.size > 0 ? Array.from(participants) : [],
        callType: 'voice',
      });
    }
  }

  // Remove socket from online users
  const userSockets = onlineUsers.get(userId);
  if (userSockets) {
    userSockets.delete(socket.id);
    if (userSockets.size === 0) {
      onlineUsers.delete(userId);

      (async () => {
        try {
          const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });

          if (userExists) {
            await prisma.user.update({
              where: { id: userId },
              data: { isOnline: false, lastSeen: new Date() },
            });

            socket.broadcast.emit('user_offline', {
              userId,
              lastSeen: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error('Socket: failed to update user offline status:', e);
        }
      })();
    }
  }
}

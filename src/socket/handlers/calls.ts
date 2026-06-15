import { Server } from 'socket.io';
import { prisma } from '../../db';
import { SENDER_SELECT } from '../../shared';
// @ts-expect-error - WebPush module is JavaScript
import { sendCallNotification } from '../../lib/webPush';
import { AuthSocket, onlineUsers, isChatMember, activeGroupCalls } from '../shared';
import { checkCallRateLimit } from '../middleware/rateLimiter';

export function setupCallHandlers(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  // ─── 1-to-1 Call: Offer ───────────────────────────────────────────
  socket.on('call_offer', async (data: { targetUserId: string; offer: unknown; callType: 'voice' | 'video'; chatId?: string }) => {
    if (!data.targetUserId) return;

    let chatId = data.chatId;
    if (!chatId) {
      const commonChat = await prisma.chat.findFirst({
        where: {
          type: 'personal',
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: data.targetUserId } } },
          ],
        },
        select: { id: true },
      });
      if (!commonChat) {
        socket.emit('call_unavailable', { targetUserId: data.targetUserId });
        return;
      }
      chatId = commonChat.id;
    } else {
      if (!(await isChatMember(chatId, userId)) || !(await isChatMember(chatId, data.targetUserId))) {
        socket.emit('error', { message: 'Нет общего чата для звонка' });
        return;
      }
    }

    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      let callerInfo: { id: string; username: string; displayName: string; avatar: string | null } | null = null;
      try {
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, displayName: true, avatar: true },
        });
        callerInfo = caller;
      } catch (e) {
        // Ignore lookup errors
      }
      for (const sid of targetSockets) {
        io.to(sid).emit('call_incoming', {
          from: userId,
          offer: data.offer,
          callType: data.callType,
          chatId,
          callerInfo,
        });
      }
    } else {
      socket.emit('call_unavailable', { targetUserId: data.targetUserId });

      try {
        const targetUser = await prisma.user.findUnique({
          where: { id: data.targetUserId },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            pushSubscription: true,
            notifyAll: true,
            notifyCalls: true
          },
        });

        if (targetUser?.pushSubscription && targetUser.notifyAll && targetUser.notifyCalls) {
          try {
            const subscription = JSON.parse(targetUser.pushSubscription);
            const caller = await prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, username: true, displayName: true, avatar: true },
            });

            await sendCallNotification(data.targetUserId, subscription, {
              callerId: userId,
              callerName: caller?.displayName || caller?.username || 'Неизвестный',
              callerAvatar: caller?.avatar || null,
              callType: data.callType,
              chatId: chatId || ''
            });
            console.log(`[Push] Call notification sent to offline user ${data.targetUserId}`);
          } catch (e: any) {
            console.error(`[Push] Failed to send Web Push for call to ${data.targetUserId}:`, e.message);
            if (e.statusCode === 410 || e.statusCode === 404) {
              try {
                await prisma.user.update({
                  where: { id: data.targetUserId },
                  data: { pushSubscription: null }
                });
                console.log(`[Push] Cleared expired subscription for user ${data.targetUserId}`);
              } catch { /* empty */ }
            }
          }
        }
      } catch (e) {
        console.error('[Push] Failed to send call notification:', e);
      }
    }
  });

  // ─── 1-to-1 Call: Answer ──────────────────────────────────────────
  socket.on('call_answer', (data: { targetUserId: string; answer: unknown }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('call_answered', {
          from: userId,
          answer: data.answer,
        });
      }
    }
  });

  // ─── ICE candidate exchange ────────────────────────────────────────
  socket.on('ice_candidate', (data: { targetUserId: string; candidate: unknown }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('ice_candidate', {
          from: userId,
          candidate: data.candidate,
        });
      }
    }
  });

  // ─── End call ─────────────────────────────────────────────────────
  socket.on('call_end', async (data: { targetUserId: string; chatId?: string; duration?: number; status?: 'completed' | 'missed' | 'declined'; callType?: 'voice' | 'video' }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('call_ended', { from: userId });
      }
    }

    if (data.chatId) {
      try {
        const callMessage = await prisma.message.create({
          data: {
            chatId: data.chatId,
            senderId: userId,
            type: 'call',
            content: JSON.stringify({
              callType: data.callType || 'voice',
              callStatus: data.status || 'completed',
              callDuration: data.duration || 0,
            }),
          },
          include: {
            sender: { select: SENDER_SELECT },
            media: true,
            reactions: true,
            readBy: true,
          },
        });

        io.to(`chat:${data.chatId}`).emit('new_message', callMessage);
      } catch (e) {
        console.error('Failed to create call message:', e);
      }
    }
  });

  // ─── Decline call ─────────────────────────────────────────────────
  socket.on('call_decline', (data: { targetUserId: string }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('call_declined', { from: userId });
      }
    }
  });

  // ─── Renegotiate (add video/screen share) ─────────────────────────
  socket.on('renegotiate', (data: { targetUserId: string; offer: unknown }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('renegotiate', { from: userId, offer: data.offer });
      }
    }
  });

  socket.on('renegotiate_answer', (data: { targetUserId: string; answer: unknown }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('renegotiate_answer', { from: userId, answer: data.answer });
      }
    }
  });

  // ─── Call reaction (emoji to other party) ─────────────────────────
  socket.on('call_reaction', (data: { targetUserId: string; emoji: string; isSticker?: boolean; x?: number }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('call_reaction', {
          from: userId,
          emoji: data.emoji,
          isSticker: data.isSticker,
          x: data.x
        });
      }
    }
  });

  // ─── Group call: status query ─────────────────────────────────────
  socket.on('group_call_status', async (data: { chatId: string }) => {
    if (!data.chatId || typeof data.chatId !== 'string') return;
    if (!(await isChatMember(data.chatId, userId))) return;
    const participants = activeGroupCalls.get(data.chatId);
    socket.emit('group_call_active', {
      chatId: data.chatId,
      participants: participants ? Array.from(participants) : [],
      callType: 'voice',
    });
  });

  // ─── Group call: join ─────────────────────────────────────────────
  socket.on('group_call_join', async (data: { chatId: string; callType: 'voice' | 'video' }) => {
    if (!data.chatId || typeof data.chatId !== 'string') return;
    if (!checkCallRateLimit(userId)) {
      socket.emit('error', { message: 'Слишком много запросов. Подождите.' });
      return;
    }
    if (!(await isChatMember(data.chatId, userId))) {
      socket.emit('error', { message: 'Нет доступа к этому чату' });
      return;
    }

    const now = Date.now();
    const joinHistory = (socket as any)._callJoinHistory || ((socket as any)._callJoinHistory = [] as number[]);
    (socket as any)._callJoinHistory = joinHistory.filter((t: number) => now - t < 60000);
    if (joinHistory.length >= 5) {
      socket.emit('error', { message: 'Слишком много попыток подключения. Подождите минуту.' });
      return;
    }
    joinHistory.push(now);

    const maxParticipants = data.callType === 'video' ? 16 : 32;

    const chat = await prisma.chat.findUnique({ where: { id: data.chatId }, select: { type: true } });
    if (!chat || chat.type !== 'group') return;

    if (!activeGroupCalls.has(data.chatId)) {
      activeGroupCalls.set(data.chatId, new Set());
    }
    const participants = activeGroupCalls.get(data.chatId)!;

    if (participants.size >= maxParticipants) {
      socket.emit('error', { message: `Достигнут лимит участников (${maxParticipants})` });
      return;
    }
    const existingParticipants = Array.from(participants);
    participants.add(userId);

    const joinerInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatar: true },
    });

    for (const pid of existingParticipants) {
      const pSockets = onlineUsers.get(pid);
      if (pSockets) {
        for (const sid of pSockets) {
          io.to(sid).emit('group_call_user_joined', {
            chatId: data.chatId,
            userId,
            userInfo: joinerInfo,
          });
        }
      }
    }

    const participantInfos = await prisma.user.findMany({
      where: { id: { in: existingParticipants } },
      select: { id: true, username: true, displayName: true, avatar: true },
    });

    socket.emit('group_call_participants', {
      chatId: data.chatId,
      participants: participantInfos,
    });

    io.to(`chat:${data.chatId}`).emit('group_call_active', {
      chatId: data.chatId,
      participants: Array.from(participants),
      callType: data.callType,
    });
  });

  // ─── Group call: leave ────────────────────────────────────────────
  socket.on('group_call_leave', async (data: { chatId: string }) => {
    if (!data.chatId) return;
    const participants = activeGroupCalls.get(data.chatId);
    if (!participants) return;
    participants.delete(userId);

    for (const pid of participants) {
      const pSockets = onlineUsers.get(pid);
      if (pSockets) {
        for (const sid of pSockets) {
          io.to(sid).emit('group_call_user_left', { chatId: data.chatId, userId });
        }
      }
    }

    if (participants.size === 0) {
      activeGroupCalls.delete(data.chatId);
    }

    io.to(`chat:${data.chatId}`).emit('group_call_active', {
      chatId: data.chatId,
      participants: participants.size > 0 ? Array.from(participants) : [],
      callType: 'voice',
    });
  });

  // ─── Group call: signaling relay ──────────────────────────────────
  socket.on('group_call_offer', (data: { chatId: string; targetUserId: string; offer: unknown }) => {
    if (!checkCallRateLimit(userId)) return;
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('group_call_offer', { chatId: data.chatId, from: userId, offer: data.offer });
      }
    }
  });

  socket.on('group_call_answer', (data: { chatId: string; targetUserId: string; answer: unknown }) => {
    if (!checkCallRateLimit(userId)) return;
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('group_call_answer', { chatId: data.chatId, from: userId, answer: data.answer });
      }
    }
  });

  socket.on('group_ice_candidate', (data: { chatId: string; targetUserId: string; candidate: unknown }) => {
    if (!checkCallRateLimit(userId)) return;
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('group_ice_candidate', { chatId: data.chatId, from: userId, candidate: data.candidate });
      }
    }
  });

  socket.on('group_call_renegotiate', (data: { chatId: string; targetUserId: string; offer: unknown }) => {
    if (!checkCallRateLimit(userId)) return;
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('group_call_renegotiate', { chatId: data.chatId, from: userId, offer: data.offer });
      }
    }
  });

  socket.on('group_call_renegotiate_answer', (data: { chatId: string; targetUserId: string; answer: unknown }) => {
    const targetSockets = onlineUsers.get(data.targetUserId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('group_call_renegotiate_answer', { chatId: data.chatId, from: userId, answer: data.answer });
      }
    }
  });
}

import { Server } from 'socket.io';
import { prisma } from '../../db';
// @ts-expect-error - WebPush module is JavaScript
import { sendFriendRequestNotification } from '../../lib/webPush';
import { AuthSocket, onlineUsers, isChatMember } from '../shared';

export function setupMiscHandlers(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  // ─── Join / leave chat rooms ──────────────────────────────────────
  socket.on('join_chat', async (chatId: string) => {
    if (await isChatMember(chatId, userId)) {
      socket.join(`chat:${chatId}`);
    }
  });

  socket.on('leave_chat', (chatId: string) => {
    socket.leave(`chat:${chatId}`);
  });

  // ─── Friend request ───────────────────────────────────────────────
  socket.on('friend_request', async (data: { friendId: string }) => {
    if (!data.friendId || typeof data.friendId !== 'string') return;
    const friendship = await prisma.friendship.findFirst({
      where: { userId, friendId: data.friendId, status: 'pending' },
    });
    if (!friendship) return;

    const targetSockets = onlineUsers.get(data.friendId);
    if (targetSockets) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true },
      });
      for (const sid of targetSockets) {
        io.to(sid).emit('friend_request_received', { from: user });
      }
    } else {
      try {
        const targetUser = await prisma.user.findUnique({
          where: { id: data.friendId },
          select: { pushSubscription: true, notifyAll: true, notifyFriends: true }
        });

        if (targetUser?.pushSubscription && targetUser.notifyAll && targetUser.notifyFriends) {
          const requester = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, displayName: true, avatar: true }
          });

          try {
            const subscription = JSON.parse(targetUser.pushSubscription);
            await sendFriendRequestNotification(data.friendId, subscription, {
              requesterId: userId,
              requesterName: requester?.displayName || requester?.username || 'Неизвестный',
              requesterAvatar: requester?.avatar || null
            });
            console.log(`[Push] Friend request notification sent to offline user ${data.friendId}`);
          } catch (e: any) {
            console.error(`[Push] Failed to send Web Push for friend request to ${data.friendId}:`, e.message);
            if (e.statusCode === 410 || e.statusCode === 404) {
              try {
                await prisma.user.update({
                  where: { id: data.friendId },
                  data: { pushSubscription: null }
                });
                console.log(`[Push] Cleared expired subscription for user ${data.friendId}`);
              } catch { /* empty */ }
            }
          }
        }
      } catch (e) {
        console.error('[Push] Failed to send friend request notification:', e);
      }
    }
  });

  // ─── Friend accepted ──────────────────────────────────────────────
  socket.on('friend_accepted', async (data: { friendId: string }) => {
    if (!data.friendId || typeof data.friendId !== 'string') return;
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { userId, friendId: data.friendId },
          { userId: data.friendId, friendId: userId },
        ],
      },
    });
    if (!friendship) return;

    const targetSockets = onlineUsers.get(data.friendId);
    if (targetSockets) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true },
      });
      for (const sid of targetSockets) {
        io.to(sid).emit('friend_request_accepted', { from: user });
      }
    }
  });

  // ─── Friend removed ───────────────────────────────────────────────
  socket.on('friend_removed', async (data: { friendId: string }) => {
    if (!data.friendId || typeof data.friendId !== 'string') return;
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: data.friendId },
          { userId: data.friendId, friendId: userId },
        ],
      },
    });
    if (friendship) return;

    const targetSockets = onlineUsers.get(data.friendId);
    if (targetSockets) {
      for (const sid of targetSockets) {
        io.to(sid).emit('friend_removed', { userId });
      }
    }
  });

  // ─── Video sharing ────────────────────────────────────────────────
  socket.on('video_share_start', async (data: { chatId: string; videoUrl: string; type: 'file' | 'url' }) => {
    if (!data.chatId || !data.videoUrl) return;
    if (!(await isChatMember(data.chatId, userId))) return;
    socket.to(`chat:${data.chatId}`).emit('video_share_started', {
      from: userId,
      videoUrl: data.videoUrl,
      type: data.type,
    });
  });

  socket.on('video_share_stop', async (data: { chatId: string }) => {
    if (!data.chatId) return;
    if (!(await isChatMember(data.chatId, userId))) return;
    socket.to(`chat:${data.chatId}`).emit('video_share_stopped', { from: userId });
  });

  socket.on('video_share_sync', async (data: { chatId: string; currentTime: number; isPlaying: boolean }) => {
    if (!data.chatId) return;
    if (!(await isChatMember(data.chatId, userId))) return;
    socket.to(`chat:${data.chatId}`).emit('video_share_sync', {
      from: userId,
      currentTime: data.currentTime,
      isPlaying: data.isPlaying,
    });
  });

  // ─── Watch party ──────────────────────────────────────────────────
  socket.on('watch_party_created', async (data: { callId: string; partyId: string; chatId: string }) => {
    if (!data.callId || !data.partyId || !data.chatId) return;
    io.to(`chat:${data.chatId}`).emit('watch_party_created', {
      callId: data.callId,
      partyId: data.partyId,
      hostId: userId,
    });
  });

  socket.on('watch_party_sync', async (data: { partyId: string; isPlaying: boolean; currentTime: number; chatId: string }) => {
    if (!data.partyId || !data.chatId) return;
    socket.to(`chat:${data.chatId}`).emit('watch_party_sync', {
      partyId: data.partyId,
      isPlaying: data.isPlaying,
      currentTime: data.currentTime,
    });
  });

  socket.on('watch_party_participant_ready', async (data: { partyId: string; isReady: boolean; chatId: string }) => {
    if (!data.partyId || !data.chatId) return;
    socket.to(`chat:${data.chatId}`).emit('watch_party_participant_ready', {
      partyId: data.partyId,
      userId,
      isReady: data.isReady,
    });
  });

  socket.on('watch_party_ended', async (data: { partyId: string; chatId: string }) => {
    if (!data.partyId || !data.chatId) return;
    io.to(`chat:${data.chatId}`).emit('watch_party_ended', {
      partyId: data.partyId,
    });
  });

  // ─── NFT events ───────────────────────────────────────────────────
  socket.on('nft:price_changed', (data: { cardId: string; oldPrice: number; newPrice: number; change: number }) => {
    io.to(`user:${userId}`).emit('nft:price_changed', data);
  });

  socket.on('nft:gift_received', (data: { fromUserId: string; cardName: string; message: string; instanceId: string }) => {
    io.to(`user:${userId}`).emit('nft:gift_received', data);
  });

  socket.on('nft:sold', (data: { cardName: string; price: number; buyerId: string }) => {
    io.to(`user:${userId}`).emit('nft:sold', data);
  });

  // ─── Drawing board (real-time collaboration) ──────────────────────
  socket.on('drawing:stroke', async (data: { chatId: string; sessionId: string; stroke: any }) => {
    try {
      if (!data.chatId || !data.sessionId || !data.stroke) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('drawing:stroke', {
        sessionId: data.sessionId,
        stroke: data.stroke,
        userId,
      });
    } catch (e) {
      console.error('Drawing stroke error:', e);
    }
  });

  socket.on('drawing:clear', async (data: { chatId: string; sessionId: string }) => {
    try {
      if (!data.chatId || !data.sessionId) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('drawing:clear', {
        sessionId: data.sessionId,
        userId,
      });
    } catch (e) {
      console.error('Drawing clear error:', e);
    }
  });

  socket.on('drawing:undo', async (data: { chatId: string; sessionId: string }) => {
    try {
      if (!data.chatId || !data.sessionId) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('drawing:undo', {
        sessionId: data.sessionId,
        userId,
      });
    } catch (e) {
      console.error('Drawing undo error:', e);
    }
  });

  socket.on('drawing:cursor', async (data: { chatId: string; sessionId: string; x: number; y: number }) => {
    try {
      if (!data.chatId || !data.sessionId) return;
      socket.to(`chat:${data.chatId}`).emit('drawing:cursor', {
        sessionId: data.sessionId,
        userId,
        x: data.x,
        y: data.y,
      });
    } catch (_e) {
      // Ignore cursor errors
    }
  });

  // ─── Playlist real-time events ────────────────────────────────────
  socket.on('playlist:track_added', (data: { playlistId: string; track: any }) => {
    if (!data.playlistId) return;
    socket.to(`playlist:${data.playlistId}`).emit('playlist:track_added', {
      track: data.track,
      addedBy: userId,
    });
  });

  socket.on('playlist:track_removed', (data: { playlistId: string; trackId: string }) => {
    if (!data.playlistId || !data.trackId) return;
    socket.to(`playlist:${data.playlistId}`).emit('playlist:track_removed', {
      trackId: data.trackId,
      removedBy: userId,
    });
  });
}

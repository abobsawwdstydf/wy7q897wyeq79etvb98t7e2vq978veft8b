import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { config } from '../config';
import { SENDER_SELECT, deleteUploadedFile } from '../shared';
// @ts-ignore - WebPush module is JavaScript
import { sendCallNotification, sendMessageNotification, sendFriendRequestNotification } from '../lib/webPush';
import { parseMarkdown } from '../lib/markdown';
import { setupTypingIndicators } from '../lib/typingIndicators';

interface AuthSocket extends Socket {
  userId?: string;
}

const onlineUsers = new Map<string, Set<string>>();

// ─── Global io instance for external access ──────────────────────────
let _io: Server | null = null;
export function getSocket(): Server | null { return _io; }
export function getIO(): Server {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
}
export const io: Server | null = _io;
export function setSocket(server: Server) { _io = server; }

// ─── Active group calls: chatId → Set<userId> ────────────────────────
const activeGroupCalls = new Map<string, Set<string>>();

// ─── Socket rate limiting ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // max events per window

const MAX_TIMEOUT = 2_147_483_647; // Max safe setTimeout delay (~24.8 days)

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean up stale rate-limit entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 30_000);

// ─── Group call rate limiting ─────────────────────────────────────────
const callRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const CALL_RATE_LIMIT_WINDOW = 5000; // 5 seconds
const CALL_RATE_LIMIT_MAX = 3; // max call events per window

function checkCallRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = callRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    callRateLimitMap.set(userId, { count: 1, resetAt: now + CALL_RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= CALL_RATE_LIMIT_MAX;
}

async function isChatMember(chatId: string, userId: string): Promise<boolean> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return !!member;
}

async function isChannelAdmin(chatId: string, userId: string): Promise<boolean> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true },
  });
  
  if (chat?.type !== 'channel') return false;
  
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { role: true },
  });
  
  return member?.role === 'admin';
}

export function setupSocket(io: Server) {
  _io = io;
  // On startup, re-schedule any pending scheduled messages
  rescheduleMessages(io);
  
  // Setup typing indicators
  setupTypingIndicators(io);

  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token;
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
        // Check if ban has expired
        if (user.banExpiresAt && user.banExpiresAt < new Date()) {
          // Unban user automatically
          await prisma.user.update({
            where: { id: userId },
            data: { isBanned: false, banReason: null, banExpiresAt: null, bannedAt: null, bannedBy: null },
          });
        } else {
          // User is still banned, disconnect
          socket.emit('banned', { message: 'Ваш аккаунт заблокирован' });
          socket.disconnect(true);
          return;
        }
      }
    } catch (e) {
      console.error('Socket: failed to check ban status:', e);
    }

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    try {
      // Check if user exists before updating
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
      // User might not exist yet, skip silently
      console.error('Socket: failed to update user online status:', e);
    }

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

    socket.on('join_chat', async (chatId: string) => {
      if (await isChatMember(chatId, userId)) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('leave_chat', (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    // Отправка сообщения
    socket.on('send_message', async (data: {
      chatId: string;
      content?: string;
      type?: string;
      replyToId?: string;
      quote?: string;
      quoteSelection?: string; // Selected part of quoted message
      forwardedFromId?: string;
      mediaUrl?: string;
      mediaType?: string;
      fileName?: string;
      fileSize?: number;
      duration?: number;
      scheduledAt?: string;
      albumCount?: number;
      media?: Array<{
        type: string;
        url: string;
        fileId?: string;
        filename?: string;
        size?: number;
        duration?: number;
      }>;
    }) => {
      try {
        // Rate limit
        if (!checkRateLimit(userId)) {
          socket.emit('error', { message: 'Слишком много сообщений, подождите' });
          return;
        }

        // Validate payload
        if (!data.chatId || typeof data.chatId !== 'string') return;
        if (data.content && data.content.length > 10000) {
          socket.emit('error', { message: 'Сообщение слишком длинное' });
          return;
        }

        // Membership check
        if (!(await isChatMember(data.chatId, userId))) {
          socket.emit('error', { message: 'Нет доступа к этому чату' });
          return;
        }

        // Channel check - only admin can post in channels
        const chat = await prisma.chat.findUnique({
          where: { id: data.chatId },
          select: { type: true, members: { where: { userId }, select: { role: true } } },
        });
        
        if (chat?.type === 'channel') {
          const member = chat.members[0];
          if (!member || member.role !== 'admin') {
            socket.emit('error', { message: 'Только администратор может писать в канале' });
            return;
          }
        }

        // Validate message type
        const VALID_TYPES = ['text', 'image', 'video', 'voice', 'file', 'gif', 'album', 'video_circle', 'video_note', 'poll', 'location', 'sticker', 'audio'];
        const msgType = data.type || 'text';
        if (!VALID_TYPES.includes(msgType)) {
          socket.emit('error', { message: 'Недопустимый тип сообщения' });
          return;
        }

        // Validate mediaUrl — allow tg://, https://, /uploads/, and /api/files/ URLs
        if (data.mediaUrl) {
          if (typeof data.mediaUrl !== 'string') {
            socket.emit('error', { message: 'Некорректный mediaUrl' });
            return;
          }
          const isExternalUrl = data.mediaUrl.startsWith('https://');
          const isLocalUpload = data.mediaUrl.startsWith('/uploads/');
          const isApiFile = data.mediaUrl.startsWith('/api/files/');

          if (!isExternalUrl && !isLocalUpload && !isApiFile) {
            socket.emit('error', { message: 'Недопустимый mediaUrl' });
            return;
          }
          if (isLocalUpload && data.mediaUrl.includes('..')) {
            socket.emit('error', { message: 'Недопустимый путь в mediaUrl' });
            return;
          }
        }

        const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;

        // Validate scheduledAt — must be in the future and within 7 days
        if (scheduledAt) {
          const now = Date.now();
          const maxSchedule = now + 7 * 24 * 60 * 60 * 1000;
          if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now || scheduledAt.getTime() > maxSchedule) {
            socket.emit('error', { message: 'Некорректная дата отложенного сообщения' });
            return;
          }
        }

        // Validate forwardedFromId — must reference an existing user
        let validForwardedFromId: string | null = null;
        if (data.forwardedFromId) {
          const forwardUser = await prisma.user.findUnique({ where: { id: data.forwardedFromId }, select: { id: true } });
          if (forwardUser) {
            validForwardedFromId = forwardUser.id;
          }
        }

        // Parse markdown and extract mentions
        const parsed = data.content ? parseMarkdown(data.content) : { html: '', plainText: '', mentions: [] };

        // Extract hashtags from content
        const hashtagRegex = /#(\w+)/g;
        const hashtags: string[] = [];
        if (data.content) {
          let match;
          while ((match = hashtagRegex.exec(data.content)) !== null) {
            hashtags.push(match[1].toLowerCase());
          }
        }

        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            senderId: userId,
            content: data.content || null,
            type: msgType,
            replyToId: data.replyToId || null,
            quote: data.quote || null,
            quoteSelection: data.quoteSelection || null,
            forwardedFromId: validForwardedFromId,
            scheduledAt,
            // Create mentions
            mentions: parsed.mentions.length > 0 ? {
              create: await Promise.all(
                parsed.mentions.map(async (username) => {
                  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
                  return user ? { userId: user.id } : null;
                })
              ).then(results => results.filter(Boolean) as { userId: string }[])
            } : undefined,
            // Создаём media: либо одно, либо несколько для альбома
            media: data.media && data.media.length > 1
              ? { create: data.media.map(m => {
                  const fileId = m.fileId || m.url;
                  return {
                    type: m.type,
                    url: fileId ? `/api/files/${fileId}/download` : m.url,
                    filename: m.filename,
                    size: m.size,
                    duration: m.duration,
                    localFileId: fileId || null,
                  };
                }) }
              : data.mediaUrl
                ? { create: {
                    type: data.mediaType || 'file',
                    url: data.mediaUrl,
                    filename: data.fileName,
                    size: data.fileSize,
                    duration: data.duration,
                    localFileId: null,
                  }}
                : undefined,
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

        // Process hashtags after message creation
        if (hashtags.length > 0) {
          for (const tag of hashtags) {
            // Upsert hashtag
            const hashtag = await prisma.hashtag.upsert({
              where: { tag },
              create: { tag, useCount: 1, lastUsedAt: new Date() },
              update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
            });

            // Link message to hashtag
            await prisma.messageHashtag.create({
              data: { messageId: message.id, hashtagId: hashtag.id },
            }).catch(() => {}); // Ignore duplicates
          }
        }

        // Scheduled messages: only send to the sender immediately, deliver to chat at scheduled time
        if (scheduledAt && scheduledAt.getTime() > Date.now()) {
          socket.emit('new_message', {
            ...message,
            readBy: [{ userId }],
          });

          const delay = Math.min(scheduledAt.getTime() - Date.now(), MAX_TIMEOUT);
          setTimeout(async () => {
            try {
              // Check if message was deleted while waiting
              const current = await prisma.message.findUnique({ where: { id: message.id } });
              if (!current || current.isDeleted) return;

              // Clear scheduledAt and emit to all
              await prisma.message.update({
                where: { id: message.id },
                data: { scheduledAt: null },
              });

              await prisma.readReceipt.create({
                data: { messageId: message.id, userId },
              });

              const members = await prisma.chatMember.findMany({
                where: { chatId: data.chatId },
                select: { userId: true },
              });
              for (const member of members) {
                const memberSockets = onlineUsers.get(member.userId);
                if (memberSockets) {
                  for (const sid of memberSockets) {
                    const memberSocket = io.sockets.sockets.get(sid);
                    if (memberSocket) memberSocket.join(`chat:${data.chatId}`);
                  }
                }
              }

              const updated = await prisma.message.findUnique({
                where: { id: message.id },
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
                // Get chat details for notification
                const chat = await prisma.chat.findUnique({
                  where: { id: data.chatId },
                  include: {
                    members: {
                      include: { user: { select: { id: true, username: true, displayName: true } } },
                    },
                  },
                });
                let recipientName = '';
                if (chat) {
                  if (chat.type === 'group') {
                    recipientName = chat.name || 'Group';
                  } else if (chat.type === 'favorites') {
                    recipientName = 'Избранное';
                  } else {
                    const otherMember = chat.members.find(m => m.userId !== userId);
                    recipientName = otherMember?.user.displayName || otherMember?.user.username || '';
                  }
                }

                io.to(`chat:${data.chatId}`).emit('scheduled_delivered', {
                  ...updated,
                  readBy: updated.readBy.map(r => ({ userId: r.userId })),
                  _recipientName: recipientName,
                  _deliveredAt: new Date().toISOString(),
                });
              }
            } catch (err) {
              console.error('Scheduled delivery error:', err);
            }
          }, delay);
          return;
        }

        await prisma.readReceipt.create({
          data: { messageId: message.id, userId },
        });

        const members = await prisma.chatMember.findMany({
          where: { chatId: data.chatId },
          select: { userId: true },
        });

        for (const member of members) {
          const memberSockets = onlineUsers.get(member.userId);
          if (memberSockets) {
            for (const sid of memberSockets) {
              const memberSocket = io.sockets.sockets.get(sid);
              if (memberSocket) {
                memberSocket.join(`chat:${data.chatId}`);
              }
            }
          }
        }

        // Transform media URLs from tg:// to /api/files/.../download
        const transformMedia = (media: any[]) => (media || []).map((m: any) => ({
          ...m,
          url: m.url?.startsWith('tg://') ? `/api/files/${m.url.replace('tg://', '')}/download` : m.url,
        }));

        io.to(`chat:${data.chatId}`).emit('new_message', {
          ...message,
          media: transformMedia((message as any).media),
          readBy: [{ userId }],
        });

        // Send Web Push to OFFLINE users only
        try {
          const chat = await prisma.chat.findUnique({
            where: { id: data.chatId },
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true,
                      pushSubscription: true,
                      notifyAll: true,
                      notifyMessages: true
                    }
                  }
                }
              }
            }
          });

          if (chat) {
            const sender = await prisma.user.findUnique({
              where: { id: userId },
              select: { id: true, username: true, displayName: true, avatar: true }
            });

            let chatName = '';
            if (chat.type === 'group' || chat.type === 'channel') {
              chatName = chat.name || 'Группа';
            } else if (chat.type === 'favorites') {
              chatName = 'Избранное';
            } else {
              const otherMember = chat.members.find(m => m.userId !== userId);
              chatName = otherMember?.user.displayName || otherMember?.user.username || '';
            }

            for (const member of chat.members) {
              if (member.userId === userId) continue; // Don't notify sender

              // Check if user is OFFLINE (not in onlineUsers map)
              const isOnline = onlineUsers.has(member.userId);
              
              // Send push notification ONLY to offline users with valid subscription and enabled notifications
              if (!isOnline && member.user.notifyAll && member.user.notifyMessages && member.user.pushSubscription) {
                try {
                  const subscription = JSON.parse(member.user.pushSubscription);
                  await sendMessageNotification(member.userId, subscription, {
                    id: message.id,
                    chatId: data.chatId,
                    senderId: userId,
                    content: message.content || (message.type !== 'text' ? '📎 Вложение' : ''),
                    chatName,
                    senderAvatar: sender?.avatar
                  });
                  console.log(`[Push] Message notification sent to offline user ${member.userId}`);
                } catch (e: any) {
                  console.error(`[Push] Failed to send Web Push to ${member.userId}:`, e.message);
                  // Clear expired subscription
                  if (e.statusCode === 410 || e.statusCode === 404) {
                    try {
                      await prisma.user.update({
                        where: { id: member.userId },
                        data: { pushSubscription: null }
                      });
                      console.log(`[Push] Cleared expired subscription for user ${member.userId}`);
                    } catch {}
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('[Push] Failed to send message notification:', e);
        }
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Ошибка отправки сообщения' });
      }
    });

    // Индикатор набора текста (with membership check)
    socket.on('typing_start', async (chatId: string) => {
      if (!chatId || typeof chatId !== 'string') return;
      if (!(await isChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId });
    });

    socket.on('typing_stop', async (chatId: string) => {
      if (!chatId || typeof chatId !== 'string') return;
      if (!(await isChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('user_stopped_typing', { chatId, userId });
    });

    // Отметки о прочтении
    socket.on('read_messages', async (data: { chatId: string; messageIds: string[] }) => {
      try {
        if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        // Limit array size to prevent abuse
        if (data.messageIds.length > 200) {
          socket.emit('error', { message: 'Слишком много сообщений за раз (макс. 200)' });
          return;
        }
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.$transaction(
          data.messageIds.map(messageId =>
            prisma.readReceipt.upsert({
              where: { messageId_userId: { messageId, userId } },
              create: { messageId, userId },
              update: {},
            })
          )
        );

        socket.to(`chat:${data.chatId}`).emit('messages_read', {
          chatId: data.chatId,
          userId,
          messageIds: data.messageIds,
        });
      } catch (error) {
        console.error('Read receipts error:', error);
      }
    });

    // Редактирование сообщения
    socket.on('edit_message', async (data: { messageId: string; content: string; chatId: string }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.messageId || !data.content || data.content.length > 10000) return;

        const message = await prisma.message.findUnique({ 
          where: { id: data.messageId },
          include: { chat: { select: { type: true } } }
        });
        if (!message) return;

        // Check permissions: only sender can edit, unless it's a channel (then only admins)
        if (message.chat.type === 'channel') {
          const isAdmin = await isChannelAdmin(message.chatId, userId);
          if (!isAdmin) return;
        } else {
          if (message.senderId !== userId) return;
        }

        const updated = await prisma.message.update({
          where: { id: data.messageId },
          data: { content: data.content, isEdited: true },
          include: {
            sender: { select: SENDER_SELECT },
            replyTo: {
              include: { sender: { select: { id: true, username: true, displayName: true } } },
            },
            media: true,
            reactions: { include: { user: { select: { id: true, username: true, displayName: true } } } },
            readBy: { select: { userId: true } },
          },
        });

        io.to(`chat:${message.chatId}`).emit('message_edited', updated);
      } catch (error) {
        console.error('Edit message error:', error);
      }
    });

    // Удаление сообщения
    socket.on('delete_message', async (data: { messageId: string; chatId: string }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.messageId) return;

        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          include: { 
            media: true,
            chat: { select: { type: true } }
          },
        });
        if (!message) return;

        // Проверяем членство в чате
        if (!(await isChatMember(message.chatId, userId))) return;

        // Check permissions: only sender can delete, unless it's a channel (then only admins)
        if (message.chat.type === 'channel') {
          const isAdmin = await isChannelAdmin(message.chatId, userId);
          if (!isAdmin) return;
        } else {
          if (message.senderId !== userId) return;
        }

        // Delete media files from disk
        if (message.media && message.media.length > 0) {
          for (const m of message.media) {
            if (m.url) deleteUploadedFile(m.url);
          }
          // Delete media records from DB
          await prisma.media.deleteMany({ where: { messageId: data.messageId } });
        }

        await prisma.message.update({
          where: { id: data.messageId },
          data: { isDeleted: true, content: null },
        });

        io.to(`chat:${message.chatId}`).emit('message_deleted', {
          messageId: data.messageId,
          chatId: message.chatId,
        });
      } catch (error) {
        console.error('Delete message error:', error);
      }
    });

    // Массовое удаление сообщений (с опцией «только у меня» / «у всех»)
    socket.on('delete_messages', async (data: { messageIds: string[]; chatId: string; deleteForAll: boolean }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        if (data.messageIds.length > 100) return; // лимит

        // Проверяем членство в чате
        if (!(await isChatMember(data.chatId, userId))) return;

        // Get chat type
        const chat = await prisma.chat.findUnique({
          where: { id: data.chatId },
          select: { type: true },
        });
        if (!chat) return;

        if (data.deleteForAll) {
          // Удалить у всех — проверяем права
          const messages = await prisma.message.findMany({
            where: {
              id: { in: data.messageIds },
              chatId: data.chatId,
              isDeleted: false,
            },
            include: { media: true },
          });

          const deletedIds: string[] = [];

          for (const message of messages) {
            // For channels, only admins can delete any message
            if (chat.type === 'channel') {
              const isAdmin = await isChannelAdmin(data.chatId, userId);
              if (!isAdmin) continue; // Skip this message
            } else {
              // For personal/group chats, only sender can delete their own messages
              if (message.senderId !== userId) continue; // Skip this message
            }

            // Удаляем медиа-файлы с диска
            if (message.media && message.media.length > 0) {
              for (const m of message.media) {
                if (m.url) deleteUploadedFile(m.url);
              }
              await prisma.media.deleteMany({ where: { messageId: message.id } });
            }

            await prisma.message.update({
              where: { id: message.id },
              data: { isDeleted: true, content: null },
            });

            deletedIds.push(message.id);
          }

          if (deletedIds.length > 0) {
            io.to(`chat:${data.chatId}`).emit('messages_deleted', {
              messageIds: deletedIds,
              chatId: data.chatId,
            });
          }
        } else {
          // Удалить только у меня — создаём записи HiddenMessage
          const validMessages = await prisma.message.findMany({
            where: {
              id: { in: data.messageIds },
              chatId: data.chatId,
              isDeleted: false,
            },
            select: { id: true },
          });

          const validIds = validMessages.map(m => m.id);
          if (validIds.length === 0) return;

          // Upsert hidden records (пропускаем дубли)
          await prisma.$transaction(
            validIds.map(msgId =>
              prisma.hiddenMessage.upsert({
                where: { messageId_userId: { messageId: msgId, userId } },
                create: { messageId: msgId, userId },
                update: {},
              })
            )
          );

          // Отправляем только этому пользователю
          socket.emit('messages_hidden', {
            messageIds: validIds,
            chatId: data.chatId,
          });
        }
      } catch (error) {
        console.error('Bulk delete messages error:', error);
      }
    });

    // Реакции
    socket.on('add_reaction', async (data: { messageId: string; emoji: string; chatId: string }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.chatId || !data.messageId || !data.emoji) return;
        if (typeof data.emoji !== 'string' || data.emoji.length > 10) return;
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.reaction.upsert({
          where: {
            messageId_userId_emoji: { messageId: data.messageId, userId, emoji: data.emoji },
          },
          create: { messageId: data.messageId, userId, emoji: data.emoji },
          update: {},
        });

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, displayName: true },
        });

        io.to(`chat:${data.chatId}`).emit('reaction_added', {
          messageId: data.messageId,
          chatId: data.chatId,
          userId,
          username: user?.displayName || user?.username,
          emoji: data.emoji,
        });
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    socket.on('remove_reaction', async (data: { messageId: string; emoji: string; chatId: string }) => {
      try {
        if (!data.chatId || !data.messageId || !data.emoji) return;
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.reaction.deleteMany({
          where: {
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          },
        });

        io.to(`chat:${data.chatId}`).emit('reaction_removed', {
          messageId: data.messageId,
          chatId: data.chatId,
          userId,
          emoji: data.emoji,
        });
      } catch (error) {
        console.error('Remove reaction error:', error);
      }
    });

    // ======= Poll Voting =======

    socket.on('vote_poll', async (data: { messageId: string; chatId: string; optionIndex: number }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.chatId || !data.messageId || typeof data.optionIndex !== 'number') return;
        if (!(await isChatMember(data.chatId, userId))) return;

        const poll = await prisma.poll.findUnique({
          where: { messageId: data.messageId },
          include: { options: true },
        });
        if (!poll) return;
        if (data.optionIndex < 0 || data.optionIndex >= poll.options.length) return;

        const targetOption = poll.options[data.optionIndex];
        if (!targetOption) return;

        if (!poll.allowMultiple) {
          await prisma.pollVote.deleteMany({
            where: { userId, option: { pollId: poll.id } },
          });
        }

        try {
          await prisma.pollVote.upsert({
            where: { optionId_userId: { optionId: targetOption.id, userId } },
            create: { optionId: targetOption.id, userId },
            update: {},
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
            console.log('User already voted on this option');
            return;
          }
          throw err;
        }

        const votes = await prisma.pollVote.groupBy({
          by: ['optionId'],
          where: { option: { pollId: poll.id } },
          _count: { optionId: true },
        });

        const voteCounts: Record<number, number> = {};
        poll.options.forEach((opt, idx) => {
          const v = votes.find(vv => vv.optionId === opt.id);
          voteCounts[idx] = v?._count.optionId ?? 0;
        });

        io.to(`chat:${data.chatId}`).emit('poll_updated', {
          messageId: data.messageId,
          chatId: data.chatId,
          optionIndex: data.optionIndex,
          userId,
          voteCounts,
          hasVoted: true,
        });
      } catch (error) {
        console.error('Poll vote error:', error);
      }
    });
socket.on('unvote_poll', async (data: { messageId: string; chatId: string; optionIndex: number }) => {
      try {
        if (!data.chatId || !data.messageId || typeof data.optionIndex !== 'number') return;
        if (!(await isChatMember(data.chatId, userId))) return;

        const poll = await prisma.poll.findUnique({
          where: { messageId: data.messageId },
          include: { options: true },
        });
        if (!poll) return;
        if (data.optionIndex < 0 || data.optionIndex >= poll.options.length) return;

        const targetOption = poll.options[data.optionIndex];
        if (!targetOption) return;

        await prisma.pollVote.deleteMany({
          where: { optionId: targetOption.id, userId },
        });

        const votes = await prisma.pollVote.groupBy({
          by: ['optionId'],
          where: { option: { pollId: poll.id } },
          _count: { optionId: true },
        });

        const voteCounts: Record<number, number> = {};
        poll.options.forEach((opt, idx) => {
          const v = votes.find(vv => vv.optionId === opt.id);
          voteCounts[idx] = v?._count.optionId ?? 0;
        });

        io.to(`chat:${data.chatId}`).emit('poll_updated', {
          messageId: data.messageId,
          chatId: data.chatId,
          optionIndex: data.optionIndex,
          userId,
          voteCounts,
          hasVoted: false,
          removed: true,
        });
      } catch (error) {
        console.error('Poll unvote error:', error);
      }
    });
socket.on('pin_message', async (data: { messageId: string; chatId: string }) => {
      try {
        // Verify user is member of the chat
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
          include: { chat: { select: { type: true } } },
        });
        if (!member) return;

        // Для каналов только владелец может закреплять
        if (member.chat.type === 'channel' && member.role !== 'owner' && member.role !== 'admin') {
          socket.emit('error', { message: 'Только владелец канала может закреплять сообщения' });
          return;
        }

        // Upsert pin
        await prisma.pinnedMessage.upsert({
          where: { chatId_messageId: { chatId: data.chatId, messageId: data.messageId } },
          create: { chatId: data.chatId, messageId: data.messageId },
          update: { pinnedAt: new Date() },
        });

        // Fetch the full message to broadcast
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          include: {
            sender: { select: SENDER_SELECT },
            media: true,
          },
        });

        io.to(`chat:${data.chatId}`).emit('message_pinned', {
          chatId: data.chatId,
          message,
        });
      } catch (error) {
        console.error('Pin message error:', error);
      }
    });

    socket.on('unpin_message', async (data: { messageId: string; chatId: string }) => {
      try {
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
          include: { chat: { select: { type: true } } },
        });
        if (!member) return;

        // Для каналов только владелец может откреплять
        if (member.chat.type === 'channel' && member.role !== 'owner' && member.role !== 'admin') {
          socket.emit('error', { message: 'Только владелец канала может откреплять сообщения' });
          return;
        }

        await prisma.pinnedMessage.deleteMany({
          where: { chatId: data.chatId, messageId: data.messageId },
        });

        // Find the new latest pinned message (if any)
        const latestPin = await prisma.pinnedMessage.findFirst({
          where: { chatId: data.chatId },
          orderBy: { pinnedAt: 'desc' },
          include: {
            message: {
              include: {
                sender: { select: SENDER_SELECT },
                media: true,
              },
            },
          },
        });

        io.to(`chat:${data.chatId}`).emit('message_unpinned', {
          chatId: data.chatId,
          messageId: data.messageId,
          newPinnedMessage: latestPin?.message || null,
        });
      } catch (error) {
        console.error('Unpin message error:', error);
      }
    });

    // ======= WebRTC Calls =======

    // Initiate a call: relay offer to the target user
    socket.on('call_offer', async (data: { targetUserId: string; offer: unknown; callType: 'voice' | 'video'; chatId?: string }) => {
      if (!data.targetUserId) return;

      // Find a common personal chat between caller and target (server-side lookup for security)
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
        // If chatId provided, verify membership
        if (!(await isChatMember(chatId, userId)) || !(await isChatMember(chatId, data.targetUserId))) {
          socket.emit('error', { message: 'Нет общего чата для звонка' });
          return;
        }
      }

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        // Look up caller info to send to callee
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
        // Target is offline - send push notification
        socket.emit('call_unavailable', { targetUserId: data.targetUserId });

        // Get TARGET user's subscription and send push notification
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

          // Only send if user has notifications enabled
          if (targetUser?.pushSubscription && targetUser.notifyAll && targetUser.notifyCalls) {
            try {
              const subscription = JSON.parse(targetUser.pushSubscription);
              // Get caller info for display
              const caller = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, username: true, displayName: true, avatar: true },
              });
              
              // Send with correct data structure
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
              // Clear expired subscription
              if (e.statusCode === 410 || e.statusCode === 404) {
                try {
                  await prisma.user.update({
                    where: { id: data.targetUserId },
                    data: { pushSubscription: null }
                  });
                  console.log(`[Push] Cleared expired subscription for user ${data.targetUserId}`);
                } catch {}
              }
            }
          }
        } catch (e) {
          console.error('[Push] Failed to send call notification:', e);
        }
      }
    });

    // Relay answer back to caller
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

    // ICE candidate exchange
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

    // End call
    socket.on('call_end', async (data: { targetUserId: string; chatId?: string; duration?: number; status?: 'completed' | 'missed' | 'declined' }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_ended', { from: userId });
        }
      }

      // Создать системное сообщение о звонке в чате
      if (data.chatId) {
        try {
          const callMessage = await prisma.message.create({
            data: {
              chatId: data.chatId,
              senderId: userId,
              type: 'call',
              content: JSON.stringify({
                callType: 'voice',
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

    // Decline call
    socket.on('call_decline', (data: { targetUserId: string }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_declined', { from: userId });
        }
      }
    });

    // Renegotiate (when adding video/screen share to an existing call)
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

    // Call reaction (show emoji to other party)
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

    // ======= Group Conference Calls =======

    // Query active group call status for a chat
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

    // Start or join a group call
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

      // Rate limiting: max 5 group call joins per minute per user
      const callJoinKey = `group_call_join:${userId}`;
      const now = Date.now();
      const joinHistory = (socket as any)._callJoinHistory || ((socket as any)._callJoinHistory = [] as number[]);
      (socket as any)._callJoinHistory = joinHistory.filter((t: number) => now - t < 60000);
      if (joinHistory.length >= 5) {
        socket.emit('error', { message: 'Слишком много попыток подключения. Подождите минуту.' });
        return;
      }
      joinHistory.push(now);

      // Max participants limit (32 for voice, 16 for video)
      const maxParticipants = data.callType === 'video' ? 16 : 32;

      // Verify it's a group chat
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

      // Look up joiner info
      const joinerInfo = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true },
      });

      // Notify existing participants that someone joined
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

      // Send current participant list to the joiner
      const participantInfos = await prisma.user.findMany({
        where: { id: { in: existingParticipants } },
        select: { id: true, username: true, displayName: true, avatar: true },
      });

      socket.emit('group_call_participants', {
        chatId: data.chatId,
        participants: participantInfos,
      });

      // Notify all group members about the active call (for "join" button)
      io.to(`chat:${data.chatId}`).emit('group_call_active', {
        chatId: data.chatId,
        participants: Array.from(participants),
        callType: data.callType,
      });
    });

    // Leave a group call
    socket.on('group_call_leave', async (data: { chatId: string }) => {
      if (!data.chatId) return;
      const participants = activeGroupCalls.get(data.chatId);
      if (!participants) return;
      participants.delete(userId);

      // Notify remaining participants
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

      // Update active call status
      io.to(`chat:${data.chatId}`).emit('group_call_active', {
        chatId: data.chatId,
        participants: participants.size > 0 ? Array.from(participants) : [],
        callType: 'voice',
      });
    });

    // Relay group call signaling between specific participants
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

    // ======= Friend System Events =======

    socket.on('friend_request', async (data: { friendId: string }) => {
      if (!data.friendId || typeof data.friendId !== 'string') return;
      // Verify a pending friendship actually exists
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
        // Target is offline - send Web Push
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
              // Clear expired subscription
              if (e.statusCode === 410 || e.statusCode === 404) {
                try {
                  await prisma.user.update({
                    where: { id: data.friendId },
                    data: { pushSubscription: null }
                  });
                  console.log(`[Push] Cleared expired subscription for user ${data.friendId}`);
                } catch {}
              }
            }
          }
        } catch (e) {
          console.error('[Push] Failed to send friend request notification:', e);
        }
      }
    });

    socket.on('friend_accepted', async (data: { friendId: string }) => {
      if (!data.friendId || typeof data.friendId !== 'string') return;
      // Verify an accepted friendship actually exists
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

    socket.on('friend_removed', async (data: { friendId: string }) => {
      if (!data.friendId || typeof data.friendId !== 'string') return;
      // Verify friendship was actually deleted (no record exists)
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId, friendId: data.friendId },
            { userId: data.friendId, friendId: userId },
          ],
        },
      });
      // If friendship still exists, don't emit removal
      if (friendship) return;

      const targetSockets = onlineUsers.get(data.friendId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('friend_removed', { userId });
        }
      }
    });

    // ======= Совместный просмотр видео =======

    // Начать трансляцию видео в звонке
    socket.on('video_share_start', async (data: { chatId: string; videoUrl: string; type: 'file' | 'url' }) => {
      if (!data.chatId || !data.videoUrl) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('video_share_started', {
        from: userId,
        videoUrl: data.videoUrl,
        type: data.type,
      });
    });

    // Остановить трансляцию
    socket.on('video_share_stop', async (data: { chatId: string }) => {
      if (!data.chatId) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('video_share_stopped', { from: userId });
    });

    // Синхронизация времени воспроизведения
    socket.on('video_share_sync', async (data: { chatId: string; currentTime: number; isPlaying: boolean }) => {
      if (!data.chatId) return;
      if (!(await isChatMember(data.chatId, userId))) return;
      socket.to(`chat:${data.chatId}`).emit('video_share_sync', {
        from: userId,
        currentTime: data.currentTime,
        isPlaying: data.isPlaying,
      });
    });

    // ======= Watch Party Events =======
    
    // Watch party created
    socket.on('watch_party_created', async (data: { callId: string; partyId: string }) => {
      if (!data.callId || !data.partyId) return;
      // Notify all participants in the call
      io.emit('watch_party_created', {
        callId: data.callId,
        partyId: data.partyId,
        hostId: userId,
      });
    });

    // Watch party sync (play/pause/seek)
    socket.on('watch_party_sync', async (data: { partyId: string; isPlaying: boolean; currentTime: number }) => {
      if (!data.partyId) return;
      // Broadcast to all participants except sender
      socket.broadcast.emit('watch_party_sync', {
        partyId: data.partyId,
        isPlaying: data.isPlaying,
        currentTime: data.currentTime,
      });
    });

    // Participant ready status changed
    socket.on('watch_party_participant_ready', async (data: { partyId: string; isReady: boolean }) => {
      if (!data.partyId) return;
      // Broadcast to all participants
      io.emit('watch_party_participant_ready', {
        partyId: data.partyId,
        userId,
        isReady: data.isReady,
      });
    });

    // Watch party ended
    socket.on('watch_party_ended', async (data: { partyId: string }) => {
      if (!data.partyId) return;
      // Notify all participants
      io.emit('watch_party_ended', {
        partyId: data.partyId,
      });
    });

    // ======= NFT System Events =======
    
    // NFT price changed notification
    socket.on('nft:price_changed', (data: { cardId: string; oldPrice: number; newPrice: number; change: number }) => {
      // Broadcast to user's own sockets
      io.to(`user:${userId}`).emit('nft:price_changed', data);
    });

    // NFT gift received notification
    socket.on('nft:gift_received', (data: { fromUserId: string; cardName: string; message: string; instanceId: string }) => {
      // Broadcast to user's own sockets
      io.to(`user:${userId}`).emit('nft:gift_received', data);
    });

    // NFT sold notification
    socket.on('nft:sold', (data: { cardName: string; price: number; buyerId: string }) => {
      // Broadcast to user's own sockets
      io.to(`user:${userId}`).emit('nft:sold', data);
    });

    // ======= Drawing Board (real-time collaboration) =======

    // User draws a stroke — broadcast to all chat members
    socket.on('drawing:stroke', async (data: { chatId: string; sessionId: string; stroke: any }) => {
      try {
        if (!data.chatId || !data.sessionId || !data.stroke) return;
        if (!(await isChatMember(data.chatId, userId))) return;
        // Broadcast to all other members in the chat
        socket.to(`chat:${data.chatId}`).emit('drawing:stroke', {
          sessionId: data.sessionId,
          stroke: data.stroke,
          userId,
        });
      } catch (e) {
        console.error('Drawing stroke error:', e);
      }
    });

    // User clears canvas
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

    // User undoes last stroke
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

    // User cursor position (for collaborative awareness)
    socket.on('drawing:cursor', async (data: { chatId: string; sessionId: string; x: number; y: number }) => {
      try {
        if (!data.chatId || !data.sessionId) return;
        socket.to(`chat:${data.chatId}`).emit('drawing:cursor', {
          sessionId: data.sessionId,
          userId,
          x: data.x,
          y: data.y,
        });
      } catch (e) {
        // Ignore cursor errors
      }
    });

    // ======= Playlist real-time events =======

    // Track added to playlist
    socket.on('playlist:track_added', (data: { playlistId: string; track: any }) => {
      socket.broadcast.emit(`playlist:${data.playlistId}:track_added`, {
        track: data.track,
        addedBy: userId,
      });
    });

    // Track removed from playlist
    socket.on('playlist:track_removed', (data: { playlistId: string; trackId: string }) => {
      socket.broadcast.emit(`playlist:${data.playlistId}:track_removed`, {
        trackId: data.trackId,
        removedBy: userId,
      });
    });

    // Отключение
    socket.on('disconnect', async () => {
      console.log(`Пользователь отключился: ${userId}`);

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

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          try {
            // Check if user exists before updating
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
        }
      }
    });
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
      // Stagger overdue messages by 100ms each to avoid simultaneous DB spike
      const rawDelay = new Date(msg.scheduledAt!).getTime() - Date.now();
      const delay = Math.min(Math.max(i * 100, rawDelay), MAX_TIMEOUT);
      setTimeout(async () => {
        try {
          // Check if message was deleted while waiting
          const current = await prisma.message.findUnique({ where: { id: msg.id } });
          if (!current || current.isDeleted) return;

          await prisma.message.update({
            where: { id: msg.id },
            data: { scheduledAt: null },
          });

          // Create sender read receipt
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

import { Server } from 'socket.io';
import { prisma } from '../../db';
import { SENDER_SELECT, deleteUploadedFile } from '../../shared';
// @ts-expect-error - WebPush module is JavaScript
import { sendMessageNotification } from '../../lib/webPush';
import { parseMarkdown } from '../../lib/markdown';
import { AuthSocket, onlineUsers, isChatMember, isChannelAdmin, MAX_TIMEOUT } from '../shared';
import { checkRateLimit } from '../middleware/rateLimiter';

export function setupMessageHandlers(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  // ─── Send message ─────────────────────────────────────────────────
  socket.on('send_message', async (data: {
    chatId: string;
    content?: string;
    type?: string;
    replyToId?: string;
    quote?: string;
    quoteSelection?: string;
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
      if (!checkRateLimit(userId)) {
        socket.emit('error', { message: 'Слишком много сообщений, подождите' });
        return;
      }

      if (!data.chatId || typeof data.chatId !== 'string') return;
      if (data.content && data.content.length > 10000) {
        socket.emit('error', { message: 'Сообщение слишком длинное' });
        return;
      }

      if (!(await isChatMember(data.chatId, userId))) {
        socket.emit('error', { message: 'Нет доступа к этому чату' });
        return;
      }

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

      const VALID_TYPES = ['text', 'image', 'video', 'voice', 'file', 'gif', 'album', 'video_circle', 'video_note', 'poll', 'location', 'sticker', 'audio'];
      const msgType = data.type || 'text';
      if (!VALID_TYPES.includes(msgType)) {
        socket.emit('error', { message: 'Недопустимый тип сообщения' });
        return;
      }

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

      if (scheduledAt) {
        const now = Date.now();
        const maxSchedule = now + 7 * 24 * 60 * 60 * 1000;
        if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now || scheduledAt.getTime() > maxSchedule) {
          socket.emit('error', { message: 'Некорректная дата отложенного сообщения' });
          return;
        }
      }

      let validForwardedFromId: string | null = null;
      if (data.forwardedFromId) {
        const forwardUser = await prisma.user.findUnique({ where: { id: data.forwardedFromId }, select: { id: true } });
        if (forwardUser) {
          validForwardedFromId = forwardUser.id;
        }
      }

      const parsed = data.content ? parseMarkdown(data.content) : { html: '', plainText: '', mentions: [] };

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
          mentions: parsed.mentions.length > 0 ? {
            create: await Promise.all(
              parsed.mentions.map(async (username) => {
                const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
                return user ? { userId: user.id } : null;
              })
            ).then(results => results.filter(Boolean) as { userId: string }[])
          } : undefined,
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

      if (hashtags.length > 0) {
        for (const tag of hashtags) {
          const hashtag = await prisma.hashtag.upsert({
            where: { tag },
            create: { tag, useCount: 1, lastUsedAt: new Date() },
            update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
          });

          await prisma.messageHashtag.create({
            data: { messageId: message.id, hashtagId: hashtag.id },
          }).catch(() => {});
        }
      }

      if (scheduledAt && scheduledAt.getTime() > Date.now()) {
        socket.emit('new_message', {
          ...message,
          readBy: [{ userId }],
        });

        const delay = Math.min(scheduledAt.getTime() - Date.now(), MAX_TIMEOUT);
        setTimeout(async () => {
          try {
            const current = await prisma.message.findUnique({ where: { id: message.id } });
            if (!current || current.isDeleted) return;

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
              const chatDetails = await prisma.chat.findUnique({
                where: { id: data.chatId },
                include: {
                  members: {
                    include: { user: { select: { id: true, username: true, displayName: true } } },
                  },
                },
              });
              let recipientName = '';
              if (chatDetails) {
                if (chatDetails.type === 'group') {
                  recipientName = chatDetails.name || 'Group';
                } else if (chatDetails.type === 'favorites') {
                  recipientName = 'Избранное';
                } else {
                  const otherMember = chatDetails.members.find(m => m.userId !== userId);
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
        const chatWithMembers = await prisma.chat.findUnique({
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

        if (chatWithMembers) {
          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, displayName: true, avatar: true }
          });

          let chatName = '';
          if (chatWithMembers.type === 'group' || chatWithMembers.type === 'channel') {
            chatName = chatWithMembers.name || 'Группа';
          } else if (chatWithMembers.type === 'favorites') {
            chatName = 'Избранное';
          } else {
            const otherMember = chatWithMembers.members.find(m => m.userId !== userId);
            chatName = otherMember?.user.displayName || otherMember?.user.username || '';
          }

          for (const member of chatWithMembers.members) {
            if (member.userId === userId) continue;

            const isOnline = onlineUsers.has(member.userId);

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
                if (e.statusCode === 410 || e.statusCode === 404) {
                  try {
                    await prisma.user.update({
                      where: { id: member.userId },
                      data: { pushSubscription: null }
                    });
                    console.log(`[Push] Cleared expired subscription for user ${member.userId}`);
                  } catch { /* empty */ }
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

  // ─── Read receipts ────────────────────────────────────────────────
  socket.on('read_messages', async (data: { chatId: string; messageIds: string[] }) => {
    try {
      if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
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

  // ─── Edit message ─────────────────────────────────────────────────
  socket.on('edit_message', async (data: { messageId: string; content: string; chatId: string }) => {
    try {
      if (!checkRateLimit(userId)) return;
      if (!data.messageId || !data.content || data.content.length > 10000) return;

      const message = await prisma.message.findUnique({
        where: { id: data.messageId },
        include: { chat: { select: { type: true } } }
      });
      if (!message) return;

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

  // ─── Delete single message ────────────────────────────────────────
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

      if (!(await isChatMember(message.chatId, userId))) return;

      if (message.chat.type === 'channel') {
        const isAdmin = await isChannelAdmin(message.chatId, userId);
        if (!isAdmin) return;
      } else {
        if (message.senderId !== userId) return;
      }

      if (message.media && message.media.length > 0) {
        for (const m of message.media) {
          if (m.url) deleteUploadedFile(m.url);
        }
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

  // ─── Bulk delete messages ─────────────────────────────────────────
  socket.on('delete_messages', async (data: { messageIds: string[]; chatId: string; deleteForAll: boolean }) => {
    try {
      if (!checkRateLimit(userId)) return;
      if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
      if (data.messageIds.length > 100) return;

      if (!(await isChatMember(data.chatId, userId))) return;

      const chat = await prisma.chat.findUnique({
        where: { id: data.chatId },
        select: { type: true },
      });
      if (!chat) return;

      if (data.deleteForAll) {
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
          if (chat.type === 'channel') {
            const isAdmin = await isChannelAdmin(data.chatId, userId);
            if (!isAdmin) continue;
          } else {
            if (message.senderId !== userId) continue;
          }

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

        await prisma.$transaction(
          validIds.map(msgId =>
            prisma.hiddenMessage.upsert({
              where: { messageId_userId: { messageId: msgId, userId } },
              create: { messageId: msgId, userId },
              update: {},
            })
          )
        );

        socket.emit('messages_hidden', {
          messageIds: validIds,
          chatId: data.chatId,
        });
      }
    } catch (error) {
      console.error('Bulk delete messages error:', error);
    }
  });

  // ─── Pin message ──────────────────────────────────────────────────
  socket.on('pin_message', async (data: { messageId: string; chatId: string }) => {
    try {
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: data.chatId, userId } },
        include: { chat: { select: { type: true } } },
      });
      if (!member) return;

      if (member.chat.type === 'channel' && member.role !== 'owner' && member.role !== 'admin') {
        socket.emit('error', { message: 'Только владелец канала может закреплять сообщения' });
        return;
      }

      await prisma.pinnedMessage.upsert({
        where: { chatId_messageId: { chatId: data.chatId, messageId: data.messageId } },
        create: { chatId: data.chatId, messageId: data.messageId },
        update: { pinnedAt: new Date() },
      });

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

  // ─── Unpin message ────────────────────────────────────────────────
  socket.on('unpin_message', async (data: { messageId: string; chatId: string }) => {
    try {
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: data.chatId, userId } },
        include: { chat: { select: { type: true } } },
      });
      if (!member) return;

      if (member.chat.type === 'channel' && member.role !== 'owner' && member.role !== 'admin') {
        socket.emit('error', { message: 'Только владелец канала может откреплять сообщения' });
        return;
      }

      await prisma.pinnedMessage.deleteMany({
        where: { chatId: data.chatId, messageId: data.messageId },
      });

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

  // ─── Add reaction ─────────────────────────────────────────────────
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

  // ─── Remove reaction ──────────────────────────────────────────────
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

  // ─── Poll vote ────────────────────────────────────────────────────
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

  // ─── Poll unvote ──────────────────────────────────────────────────
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
}

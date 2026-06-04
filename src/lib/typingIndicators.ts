import { Server, Socket } from 'socket.io';
import { prisma } from '../db';

interface TypingData {
  chatId: string;
  userId: string;
  expiresAt: Date;
}

const typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // chatId -> userId -> timeout

/**
 * Setup typing indicators
 */
export function setupTypingIndicators(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    if (!userId) return;

    // User started typing
    socket.on('typing_start', async (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        if (!chatId) return;

        // Check if user is member of chat
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId, userId } }
        });

        if (!member) return;

        // Clear existing timeout
        const chatTyping = typingUsers.get(chatId);
        if (chatTyping?.has(userId)) {
          clearTimeout(chatTyping.get(userId)!);
        }

        // Set new timeout (5 seconds)
        const timeout = setTimeout(() => {
          const chatTyping = typingUsers.get(chatId);
          if (chatTyping) {
            chatTyping.delete(userId);
            if (chatTyping.size === 0) {
              typingUsers.delete(chatId);
            }
          }
          
          // Notify others that user stopped typing
          socket.to(`chat:${chatId}`).emit('typing_stop', { chatId, userId });
        }, 5000);

        // Store timeout
        if (!typingUsers.has(chatId)) {
          typingUsers.set(chatId, new Map());
        }
        typingUsers.get(chatId)!.set(userId, timeout);

        // Notify others that user is typing
        socket.to(`chat:${chatId}`).emit('typing_start', { chatId, userId });

        // Store in database for persistence
        await prisma.typingIndicator.upsert({
          where: { chatId_userId: { chatId, userId } },
          create: {
            chatId,
            userId,
            expiresAt: new Date(Date.now() + 5000)
          },
          update: {
            startedAt: new Date(),
            expiresAt: new Date(Date.now() + 5000)
          }
        });
      } catch (error) {
        console.error('Typing start error:', error);
      }
    });

    // User stopped typing
    socket.on('typing_stop', async (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        if (!chatId) return;

        // Clear timeout
        const chatTyping = typingUsers.get(chatId);
        if (chatTyping?.has(userId)) {
          clearTimeout(chatTyping.get(userId)!);
          chatTyping.delete(userId);
          if (chatTyping.size === 0) {
            typingUsers.delete(chatId);
          }
        }

        // Notify others
        socket.to(`chat:${chatId}`).emit('typing_stop', { chatId, userId });

        // Remove from database
        await prisma.typingIndicator.deleteMany({
          where: { chatId, userId }
        });
      } catch (error) {
        console.error('Typing stop error:', error);
      }
    });

    // Clean up on disconnect
    socket.on('disconnect', async () => {
      try {
        // Clear all typing indicators for this user
        for (const [chatId, chatTyping] of typingUsers.entries()) {
          if (chatTyping.has(userId)) {
            clearTimeout(chatTyping.get(userId)!);
            chatTyping.delete(userId);
            if (chatTyping.size === 0) {
              typingUsers.delete(chatId);
            }
            
            // Notify others
            socket.to(`chat:${chatId}`).emit('typing_stop', { chatId, userId });
          }
        }

        // Remove from database
        await prisma.typingIndicator.deleteMany({
          where: { userId }
        });
      } catch (error) {
        console.error('Typing cleanup error:', error);
      }
    });
  });

  // Cleanup expired typing indicators every 10 seconds
  setInterval(async () => {
    try {
      const expired = await prisma.typingIndicator.findMany({
        where: { expiresAt: { lte: new Date() } }
      });

      if (expired.length > 0) {
        for (const indicator of expired) {
          const chatTyping = typingUsers.get(indicator.chatId);
          if (chatTyping?.has(indicator.userId)) {
            clearTimeout(chatTyping.get(indicator.userId)!);
            chatTyping.delete(indicator.userId);
            if (chatTyping.size === 0) {
              typingUsers.delete(indicator.chatId);
            }
          }

          // Notify that user stopped typing
          io.to(`chat:${indicator.chatId}`).emit('typing_stop', {
            chatId: indicator.chatId,
            userId: indicator.userId
          });
        }

        await prisma.typingIndicator.deleteMany({
          where: { expiresAt: { lte: new Date() } }
        });
      }
    } catch (error) {
      console.error('Typing cleanup error:', error);
    }
  }, 10000);
}

/**
 * Get currently typing users in a chat
 */
export async function getTypingUsers(chatId: string): Promise<string[]> {
  const indicators = await prisma.typingIndicator.findMany({
    where: {
      chatId,
      expiresAt: { gt: new Date() }
    },
    select: { userId: true }
  });

  return indicators.map(i => i.userId);
}

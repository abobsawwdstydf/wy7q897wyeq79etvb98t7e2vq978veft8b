import express from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get chat statistics for user
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;

    // Check if user is member
    const member = await prisma.chatMember.findFirst({
      where: { chatId, userId }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
    }

    let stats = await prisma.chatStatistics.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId
        }
      }
    });

    if (!stats) {
      // Create initial stats
      stats = await prisma.chatStatistics.create({
        data: {
          chatId,
          userId,
          messageCount: 0,
          mediaCount: 0,
          lastActive: new Date()
        }
      });
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching chat statistics:', error);
    res.status(500).json({ error: 'Ошибка получения статистики чата' });
  }
});

// Get user activity graph
router.get('/activity', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { days = 7 } = req.query;

    const daysNum = parseInt(days as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Get message count per day
    const messages = await prisma.message.findMany({
      where: {
        senderId: userId,
        createdAt: {
          gte: startDate
        },
        isDeleted: false
      },
      select: {
        createdAt: true
      }
    });

    // Group by day
    const activityMap = new Map<string, number>();
    
    for (let i = 0; i < daysNum; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      activityMap.set(dateStr, 0);
    }

    messages.forEach(msg => {
      const dateStr = msg.createdAt.toISOString().split('T')[0];
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
    });

    const activity = Array.from(activityMap.entries()).map(([date, count]) => ({
      date,
      count
    })).reverse();

    res.json({ activity });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Ошибка получения активности' });
  }
});

// Get comprehensive user statistics
router.get('/statistics', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Total messages sent
    const totalMessages = await prisma.message.count({
      where: { senderId: userId, isDeleted: false }
    });

    // Total media sent
    const totalMedia = await prisma.message.count({
      where: {
        senderId: userId,
        isDeleted: false,
        type: { in: ['image', 'video', 'file', 'audio', 'voice'] }
      }
    });

    // Top contacts (most messages exchanged)
    const topContacts = await prisma.$queryRaw<Array<{ chatId: string; messageCount: bigint }>>`
      SELECT "chatId", COUNT(*) as "messageCount"
      FROM "Message"
      WHERE "senderId" = ${userId} AND "isDeleted" = false
      GROUP BY "chatId"
      ORDER BY "messageCount" DESC
      LIMIT 10
    `;

    // Get chat details for top contacts
    const topContactsWithDetails = await Promise.all(
      topContacts.map(async (tc) => {
        const chat = await prisma.chat.findUnique({
          where: { id: tc.chatId },
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          }
        });

        return {
          chatId: tc.chatId,
          messageCount: Number(tc.messageCount),
          chat
        };
      })
    );

    // Messages by hour (activity pattern)
    const messagesByHour = await prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT CAST(strftime('%H', "createdAt") AS INTEGER) as hour, COUNT(*) as count
      FROM "Message"
      WHERE "senderId" = ${userId} AND "isDeleted" = false
      GROUP BY hour
      ORDER BY hour
    `;

    const hourlyActivity = Array.from({ length: 24 }, (_, i) => {
      const found = messagesByHour.find(m => Number(m.hour) === i);
      return {
        hour: i,
        count: found ? Number(found.count) : 0
      };
    });

    // Total chats
    const totalChats = await prisma.chatMember.count({
      where: { userId }
    });

    // Account age
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    });

    const accountAgeDays = user 
      ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      totalMessages,
      totalMedia,
      totalChats,
      accountAgeDays,
      topContacts: topContactsWithDetails,
      hourlyActivity
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Export chat history
router.get('/export/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.userId!;
    const { format = 'json' } = req.query;

    // Check if user is member
    const member = await prisma.chatMember.findFirst({
      where: { chatId, userId }
    });

    if (!member) {
      return res.status(403).json({ error: 'Вы не являетесь участником этого чата' });
    }

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        },
        media: true
      },
      orderBy: { createdAt: 'asc' }
    });

    if (format === 'json') {
      res.json({ messages });
    } else if (format === 'txt') {
      const text = messages.map(msg => 
        `[${msg.createdAt.toISOString()}] ${msg.sender.displayName || msg.sender.username}: ${msg.content || '[media]'}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="chat-${chatId}.txt"`);
      res.send(text);
    } else {
      res.status(400).json({ error: 'Неподдерживаемый формат' });
    }
  } catch (error) {
    console.error('Error exporting chat:', error);
    res.status(500).json({ error: 'Ошибка экспорта чата' });
  }
});

// Document preview - returns file info and download URL
router.get('/preview/:fileId', async (req: AuthRequest, res) => {
  try {
    const fileId = String(req.params.fileId);

    // Get file metadata from database
    const localFile = await prisma.localFile.findUnique({
      where: { fileId },
      include: { chunks: true }
    });

    if (!localFile) {
      res.status(404).json({ error: 'Файл не найден' });
      return;
    }

    // Check if user has access to this file
    if (localFile.userId !== req.userId) {
      // Check if file is shared in a chat the user has access to
      const media = await prisma.media.findFirst({
        where: { 
          localFileId: fileId,
          message: {
            chat: {
              members: {
                some: { userId: req.userId }
              }
            }
          }
        }
      });

      if (!media) {
        res.status(403).json({ error: 'Нет доступа к файлу' });
        return;
      }
    }

    // Return file metadata for preview
    res.json({
      success: true,
      file: {
        fileId: localFile.fileId,
        name: localFile.originalName,
        mimeType: localFile.mimeType,
        size: localFile.totalSize,
        downloadUrl: `/api/files/${localFile.fileId}/download`,
        canPreview: isPreviewable(localFile.mimeType),
        type: getFileType(localFile.mimeType)
      }
    });
  } catch (error) {
    console.error('Error previewing document:', error);
    res.status(500).json({ error: 'Ошибка предпросмотра документа' });
  }
});

// Helper function to check if file type is previewable
function isPreviewable(mimeType: string): boolean {
  const previewableTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/ogg',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
    'application/pdf',
    'text/plain', 'text/html', 'text/css', 'text/javascript',
    'application/json'
  ];
  return previewableTypes.includes(mimeType);
}

// Helper function to get file type category
function getFileType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/')) return 'text';
  return 'document';
}

export default router;

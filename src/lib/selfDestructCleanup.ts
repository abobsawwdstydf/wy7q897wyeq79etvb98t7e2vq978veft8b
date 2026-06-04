import { prisma } from '../db';

// Background job to delete self-destructing messages
export async function cleanupSelfDestructMessages() {
  try {
    const now = new Date();

    // Find all messages that should be deleted
    const messagesToDelete = await prisma.message.findMany({
      where: {
        selfDestructAt: {
          lte: now
        },
        isDeleted: false
      },
      select: { id: true }
    });

    if (messagesToDelete.length === 0) {
      return;
    }

    const messageIds = messagesToDelete.map(m => m.id);

    // Mark messages as deleted
    await prisma.message.updateMany({
      where: {
        id: { in: messageIds }
      },
      data: {
        isDeleted: true,
        content: null,
        encryptedContent: null
      }
    });

    // Delete associated media
    await prisma.media.deleteMany({
      where: {
        messageId: { in: messageIds }
      }
    });

    console.log(`Deleted ${messagesToDelete.length} self-destructing messages`);
  } catch (error) {
    console.error('Error cleaning up self-destruct messages:', error);
  }
}

// Run cleanup every minute
export function startSelfDestructCleanup() {
  setInterval(() => {
    cleanupSelfDestructMessages();
  }, 60 * 1000); // Every 60 seconds

  // Run immediately on startup
  cleanupSelfDestructMessages();
}

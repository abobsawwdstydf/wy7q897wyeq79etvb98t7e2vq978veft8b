import { prisma, isDbHealthy } from '../db';

let consecutiveFailures = 0;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes max
const BASE_INTERVAL_MS = 60 * 1000;

// Background job to delete self-destructing messages
export async function cleanupSelfDestructMessages(): Promise<void> {
  if (!isDbHealthy()) return;
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
      consecutiveFailures = 0;
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

    consecutiveFailures = 0;
    console.log(`Deleted ${messagesToDelete.length} self-destructing messages`);
  } catch (error) {
    consecutiveFailures++;
    const backoffMs = Math.min(BASE_INTERVAL_MS * Math.pow(2, consecutiveFailures), MAX_BACKOFF_MS);
    console.error(
      `Error cleaning up self-destruct messages (attempt ${consecutiveFailures}, next retry in ${Math.round(backoffMs / 1000)}s):`,
      error instanceof Error ? error.message : error
    );
    // Schedule next retry with backoff instead of waiting for normal interval
    setTimeout(cleanupSelfDestructMessages, backoffMs);
  }
}

// Run cleanup every minute
export function startSelfDestructCleanup() {
  setInterval(() => {
    cleanupSelfDestructMessages();
  }, BASE_INTERVAL_MS);

  // Run immediately on startup
  cleanupSelfDestructMessages();
}

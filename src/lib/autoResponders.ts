import { prisma } from '../db';

export async function checkAutoResponders(chatId: string, senderId: string, messageContent: string) {
  try {
    // Get all active auto-responders for this chat
    const autoResponders = await prisma.autoResponder.findMany({
      where: {
        chatId,
        isActive: true,
        userId: { not: senderId } // Don't respond to own messages
      },
      include: {
        chat: {
          include: {
            members: {
              where: { userId: { in: [] } }, // Will be filled dynamically
              select: { userId: true }
            }
          }
        }
      }
    });

    const responses: Array<{ userId: string; response: string }> = [];

    for (const responder of autoResponders) {
      // Check if trigger matches
      const triggerLower = responder.trigger.toLowerCase();
      const contentLower = messageContent.toLowerCase();
      
      if (!contentLower.includes(triggerLower)) {
        continue;
      }

      // Check if user is offline (if onlyOffline is true)
      if (responder.onlyOffline) {
        const user = await prisma.user.findUnique({
          where: { id: responder.userId },
          select: { isOnline: true }
        });

        if (user?.isOnline) {
          continue; // User is online, skip auto-response
        }
      }

      responses.push({
        userId: responder.userId,
        response: responder.response
      });
    }

    return responses;
  } catch (error) {
    console.error('Error checking auto-responders:', error);
    return [];
  }
}

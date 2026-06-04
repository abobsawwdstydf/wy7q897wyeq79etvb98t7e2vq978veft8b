// Web Push notification sender
const webpush = require('web-push');

// VAPID keys (same as client)
const VAPID_PUBLIC_KEY = 'BPVXBg4HHqwRgo2rX4fnScnnL1bD0AgeSyAiufQluXGctTM0WsSD8VqJx5DUsUsev4uP1pCH42qRGFg8PsrbDd0';
const VAPID_PRIVATE_KEY = 'fykh4MzH9dDTD_xK2oTzJG7KIzzmnedIY7I7zs6W9d4';

// Configure web-push
webpush.setVapidDetails(
  'mailto:noreply@нексо-messenger.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

/**
 * Send message notification via Web Push
 */
async function sendMessageNotification(userId, subscription, messageData) {
  try {
    const { chatName, content, senderAvatar } = messageData;
    
    const payload = JSON.stringify({
      notification: {
        title: chatName || 'Нексо',
        body: content || 'Новое сообщение',
        icon: senderAvatar || '/logo.png',
        badge: '/logo.png',
        tag: messageData.chatId || 'нексо-default',
        requireInteraction: true
      },
      data: {
        chatId: messageData.chatId,
        messageId: messageData.id,
        senderId: messageData.senderId,
        type: 'message'
      }
    });

    await webpush.sendNotification(subscription, payload);
    console.log(`[Web Push] Message notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Web Push] Failed to send message notification to user ${userId}:`, error);
    
    // If subscription is expired/invalid, clear it
    if (error.statusCode === 410 || error.statusCode === 404) {
      try {
        const { prisma } = require('../db');
        await prisma.user.update({
          where: { id: userId },
          data: { pushSubscription: null }
        });
        console.log(`[Web Push] Cleared expired subscription for user ${userId}`);
      } catch (dbError) {
        console.error('[Web Push] Failed to clear expired subscription:', dbError);
      }
    }
    
    throw error;
  }
}

/**
 * Send call notification via Web Push
 */
async function sendCallNotification(userId, subscription, callData) {
  try {
    const { callerName, callerAvatar, callType, chatId } = callData;
    
    const payload = JSON.stringify({
      notification: {
        title: `${callerName || 'Входящий звонок'}`,
        body: callType === 'video' ? 'Видеозвонок' : 'Голосовой звонок',
        icon: callerAvatar || '/logo.png',
        badge: '/logo.png',
        tag: `call-${chatId}`,
        requireInteraction: true
      },
      data: {
        chatId,
        callerId: callData.callerId,
        callType,
        type: 'call'
      }
    });

    await webpush.sendNotification(subscription, payload);
    console.log(`[Web Push] Call notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Web Push] Failed to send call notification to user ${userId}:`, error);
    throw error;
  }
}

/**
 * Send friend request notification via Web Push
 */
async function sendFriendRequestNotification(userId, subscription, requesterData) {
  try {
    const { requesterName, requesterAvatar, requesterId } = requesterData;
    
    const payload = JSON.stringify({
      notification: {
        title: 'Новая заявка в друзья',
        body: `${requesterName || 'Кто-то'} хочет добавить вас в друзья`,
        icon: requesterAvatar || '/logo.png',
        badge: '/logo.png',
        tag: `friend-request-${requesterId}`,
        requireInteraction: true
      },
      data: {
        requesterId,
        type: 'friend_request'
      }
    });

    await webpush.sendNotification(subscription, payload);
    console.log(`[Web Push] Friend request notification sent to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`[Web Push] Failed to send friend request notification to user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  sendMessageNotification,
  sendCallNotification,
  sendFriendRequestNotification
};

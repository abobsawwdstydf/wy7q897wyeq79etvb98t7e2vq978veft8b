import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../db';

interface WebhookPayload {
  event: string;
  chatId: string;
  timestamp: string;
  data: any;
}

export async function triggerWebhooks(chatId: string, event: string, data: any) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        chatId,
        isActive: true
      }
    });

    for (const webhook of webhooks) {
      const events = JSON.parse(webhook.events || '[]');
      
      // Check if this event is enabled for this webhook
      if (!events.includes(event)) {
        continue;
      }

      const payload: WebhookPayload = {
        event,
        chatId,
        timestamp: new Date().toISOString(),
        data
      };

      // Create signature for verification
      const signature = webhook.secret
        ? crypto
            .createHmac('sha256', webhook.secret)
            .update(JSON.stringify(payload))
            .digest('hex')
        : undefined;

      // Send webhook (non-blocking)
      axios
        .post(webhook.url, payload, {
          headers: {
            'Content-Type': 'application/json',
            ...(signature && { 'X-Webhook-Signature': signature })
          },
          timeout: 5000
        })
        .then(() => {
          // Update last triggered time
          prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastTriggeredAt: new Date() }
          }).catch(console.error);
        })
        .catch((error) => {
          console.error(`Webhook failed for ${webhook.url}:`, error.message);
        });
    }
  } catch (error) {
    console.error('Error triggering webhooks:', error);
  }
}

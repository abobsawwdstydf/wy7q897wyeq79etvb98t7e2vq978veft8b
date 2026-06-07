import { Router } from 'express';
import { prisma } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Export a chat as HTML
router.get('/:chatId/html', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;
    const { dateFrom, dateTo, limit = '10000' } = req.query;

    // Verify membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const where: any = { chatId, isDeleted: false };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        media: true,
        reactions: { include: { user: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Number(limit), 50000),
    });

    // Build HTML
    const chatName = chat.name || chat.username || 'Чат';
    const exportDate = new Date().toLocaleString('ru-RU');

    let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Экспорт: ${chatName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0e1621; color: #fff; padding: 20px; }
  .header { text-align: center; padding: 30px 0; border-bottom: 1px solid #1e2c3a; margin-bottom: 20px; }
  .header h1 { font-size: 24px; color: #6ab2f2; }
  .header p { color: #7b8a9a; margin-top: 8px; }
  .message { display: flex; gap: 12px; padding: 8px 16px; margin: 4px 0; border-radius: 8px; }
  .message:hover { background: #1e2c3a; }
  .avatar { width: 42px; height: 42px; border-radius: 50%; background: #2b5278; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #6ab2f2; flex-shrink: 0; }
  .avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .message-content { flex: 1; }
  .message-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .sender { font-weight: 600; color: #6ab2f2; }
  .time { font-size: 12px; color: #5d6d7e; }
  .text { line-height: 1.5; color: #cfd8dc; white-space: pre-wrap; word-break: break-word; }
  .media { margin-top: 8px; }
  .media img { max-width: 300px; border-radius: 8px; }
  .media video { max-width: 400px; border-radius: 8px; }
  .reactions { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
  .reaction { background: #1e2c3a; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  .system { text-align: center; color: #5d6d7e; font-size: 13px; padding: 8px; }
</style>
</head>
<body>
<div class="header">
  <h1>${chatName}</h1>
  <p>Экспортировано: ${exportDate} | Сообщений: ${messages.length}</p>
</div>
`;

    for (const msg of messages) {
      const time = new Date(msg.createdAt).toLocaleString('ru-RU');
      const senderName = msg.sender.displayName || msg.sender.username;
      const initial = senderName.charAt(0).toUpperCase();

      let mediaHtml = '';
      for (const m of msg.media) {
        if (m.type.startsWith('image/')) {
          mediaHtml += `<div class="media"><img src="${m.url}" alt="media"></div>`;
        } else if (m.type.startsWith('video/')) {
          mediaHtml += `<div class="media"><video src="${m.url}" controls></video></div>`;
        } else if (m.type.startsWith('audio/')) {
          mediaHtml += `<div class="media"><audio src="${m.url}" controls></audio></div>`;
        } else {
          mediaHtml += `<div class="media"><a href="${m.url}" style="color:#6ab2f2">${m.filename || 'Файл'}</a></div>`;
        }
      }

      let reactionsHtml = '';
      if (msg.reactions.length > 0) {
        const grouped: Record<string, number> = {};
        for (const r of msg.reactions) {
          grouped[r.emoji] = (grouped[r.emoji] || 0) + 1;
        }
        reactionsHtml = '<div class="reactions">' +
          Object.entries(grouped).map(([emoji, count]) => `<span class="reaction">${emoji} ${count}</span>`).join('') +
          '</div>';
      }

      const avatarHtml = msg.sender.avatar
        ? `<div class="avatar"><img src="${msg.sender.avatar}" alt=""></div>`
        : `<div class="avatar">${initial}</div>`;

      html += `
<div class="message">
  ${avatarHtml}
  <div class="message-content">
    <div class="message-header">
      <span class="sender">${senderName}</span>
      <span class="time">${time}</span>
    </div>
    <div class="text">${escapeHtml(msg.content || '')}</div>
    ${mediaHtml}
    ${reactionsHtml}
  </div>
</div>`;
    }

    html += '\n</body></html>';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nexo-${chatName}-${new Date().toISOString().split('T')[0]}.html"`);
    res.send(html);
  } catch (error) {
    console.error('Export HTML error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Export a chat as JSON with full metadata
router.get('/:chatId/full', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { chatId } = req.params;
    const { dateFrom, dateTo } = req.query;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a chat member' });

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: { include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } } } },
    });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const where: any = { chatId, isDeleted: false };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, username: true, displayName: true } },
        media: true,
        reactions: true,
        readBy: { select: { userId: true, readAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50000,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="nexo-${chat.name || 'chat'}-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({
      exportDate: new Date().toISOString(),
      version: '2.0',
      chat: { id: chat.id, name: chat.name, type: chat.type, members: chat.members },
      messages,
    });
  } catch (error) {
    console.error('Export full error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;

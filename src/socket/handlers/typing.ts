import { Server } from 'socket.io';
import { AuthSocket, typingTimeouts, isChatMember } from '../shared';

export function setupTypingHandlers(io: Server, socket: AuthSocket) {
  const userId = socket.userId!;

  // ─── Typing start (with auto-timeout) ─────────────────────────────
  socket.on('typing_start', async (chatId: string) => {
    if (!chatId || typeof chatId !== 'string') return;
    if (!(await isChatMember(chatId, userId))) return;

    const timeoutKey = `${chatId}:${userId}`;
    const prev = typingTimeouts.get(timeoutKey);
    if (prev) clearTimeout(prev);

    const timeout = setTimeout(() => {
      typingTimeouts.delete(timeoutKey);
      socket.to(`chat:${chatId}`).emit('user_stopped_typing', { chatId, userId });
    }, 5000);
    typingTimeouts.set(timeoutKey, timeout);

    socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId });
  });

  // ─── Typing stop ──────────────────────────────────────────────────
  socket.on('typing_stop', async (chatId: string) => {
    if (!chatId || typeof chatId !== 'string') return;
    if (!(await isChatMember(chatId, userId))) return;

    const timeoutKey = `${chatId}:${userId}`;
    const prev = typingTimeouts.get(timeoutKey);
    if (prev) {
      clearTimeout(prev);
      typingTimeouts.delete(timeoutKey);
    }

    socket.to(`chat:${chatId}`).emit('user_stopped_typing', { chatId, userId });
  });
}

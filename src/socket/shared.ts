import { Server, Socket } from 'socket.io';
import { prisma } from '../db';

export interface AuthSocket extends Socket {
  userId?: string;
}

// ─── Online users: userId → Set<socketId> ──────────────────────────
export const onlineUsers = new Map<string, Set<string>>();

// ─── Global io instance for external access ──────────────────────────
let _io: Server | null = null;
export function getSocket(): Server | null { return _io; }
export function getIO(): Server {
  if (!_io) throw new Error('Socket.io not initialized');
  return _io;
}
export function setSocket(server: Server) { _io = server; }

// ─── Active group calls: chatId → Set<userId> ────────────────────────
export const activeGroupCalls = new Map<string, Set<string>>();

// ─── Typing auto-timeout (5 seconds) ─────────────────────────────────
export const typingTimeouts = new Map<string, NodeJS.Timeout>();

// ─── Max safe setTimeout delay (~24.8 days) ──────────────────────────
export const MAX_TIMEOUT = 2_147_483_647;

export async function isChatMember(chatId: string, userId: string): Promise<boolean> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return !!member;
}

export async function isChannelAdmin(chatId: string, userId: string): Promise<boolean> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true },
  });

  if (chat?.type !== 'channel') return false;

  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    select: { role: true },
  });

  return member?.role === 'admin';
}

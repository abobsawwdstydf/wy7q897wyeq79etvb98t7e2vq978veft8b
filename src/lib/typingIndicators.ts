import { Server } from 'socket.io';

/**
 * Setup typing indicator cleanup.
 * Real-time typing events are handled in socket/index.ts.
 */
export function setupTypingIndicators(_io: Server) {
  // No-op: typing_start / typing_stop events are handled directly in socket/index.ts
  // to avoid duplicate handlers and ensure correct event names (user_typing / user_stopped_typing).
}

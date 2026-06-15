import { Server } from 'socket.io';
import { AuthSocket } from '../shared';

/**
 * Moderation handlers (ban_user, mute_user, kick_user, slow_mode).
 * Not yet implemented in the original codebase — placeholder for future use.
 */
export function setupModerationHandlers(_io: Server, _socket: AuthSocket) {
  // No-op: moderation events are not yet implemented.
}

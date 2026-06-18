import { io } from 'socket.io-client';
import { resolveSocketBase } from '../utils/resolveSocketBase';

class PrescanSocketManager {
  constructor() {
    this.socket = null;
    this.currentTarget = null;
  }

  connect(url) {
    const target = resolveSocketBase(url);

    if (this.socket) {
      if (this.currentTarget === target) {
        if (!this.socket.connected) this.socket.connect();
        return this.socket;
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentTarget = target;

    this.socket = io(target, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      withCredentials: false,
    });

    this.socket.on('connect_error', (err) => {
      console.error('[PrescanSocket] Connection error:', err.message);
    });

    return this.socket;
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.currentTarget = null;
    }
  }

  isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const prescanSocketManager = new PrescanSocketManager();

import type { Lares4Message } from '../../types';

export interface ProtocolRouterHandlers {
  onResponse?: (message: Lares4Message) => void;
  onLoginResponse: (message: Lares4Message) => void;
  onReadResponse: (message: Lares4Message) => void;
  onRealtimeResponse: (message: Lares4Message) => void;
  onStatusUpdate: (message: Lares4Message) => void;
  onPing?: (message: Lares4Message) => void;
  onUnhandled?: (message: Lares4Message) => void;
}

export class ProtocolRouter {
  constructor(private readonly handlers: ProtocolRouterHandlers) {}

  public route(message: Lares4Message): void {
    switch (message.CMD) {
    case 'LOGIN_RES':
      this.handlers.onLoginResponse(message);
      return;
    case 'READ_RES':
      this.handlers.onReadResponse(message);
      return;
    case 'REALTIME_RES':
      this.handlers.onRealtimeResponse(message);
      return;
    case 'REALTIME':
    case 'STATUS_UPDATE':
      this.handlers.onStatusUpdate(message);
      return;
    case 'PING':
      this.handlers.onPing?.(message);
      return;
    default:
      if (message.CMD.endsWith('_RES')) {
        this.handlers.onResponse?.(message);
      } else {
        this.handlers.onUnhandled?.(message);
      }
    }
  }
}

import type { Lares4SocketLike } from '../../types';

const SOCKET_OPEN_READY_STATE = 1;

type EventHandler = (...args: unknown[]) => void;
type DomEventLike = { data?: unknown; code?: number; reason?: unknown; error?: unknown };

function decodeReason(reason: unknown): string {
  if (typeof reason === 'string') {
    return reason;
  }
  if (reason instanceof Uint8Array) {
    return new TextDecoder().decode(reason);
  }
  if (reason === undefined || reason === null) {
    return '';
  }
  return String(reason);
}

export class Lares4SocketAdapter {
  public readonly supportsPing: boolean;

  constructor(private readonly socket: Lares4SocketLike) {
    this.supportsPing = typeof socket.ping === 'function';
  }

  public isOpen(): boolean {
    return this.socket.readyState === SOCKET_OPEN_READY_STATE;
  }

  public onOpen(handler: () => void): void {
    this.attach('open', () => {
      handler();
    });
  }

  public onMessage(handler: (raw: unknown) => void): void {
    this.attach('message', (...args) => {
      const first = args[0];
      if (first && typeof first === 'object' && 'data' in (first as Record<string, unknown>)) {
        handler((first as DomEventLike).data);
        return;
      }
      handler(first);
    });
  }

  public onClose(handler: (code?: number, reason?: string) => void): void {
    this.attach('close', (...args) => {
      const first = args[0];
      if (first && typeof first === 'object' && ('code' in (first as Record<string, unknown>) || 'reason' in (first as Record<string, unknown>))) {
        const closeEvent = first as DomEventLike;
        handler(closeEvent.code, decodeReason(closeEvent.reason));
        return;
      }
      handler(typeof first === 'number' ? first : undefined, decodeReason(args[1]));
    });
  }

  public onError(handler: (error: Error) => void): void {
    this.attach('error', (...args) => {
      const first = args[0];
      if (first instanceof Error) {
        handler(first);
        return;
      }
      if (first && typeof first === 'object' && 'error' in (first as Record<string, unknown>)) {
        const errorValue = (first as DomEventLike).error;
        if (errorValue instanceof Error) {
          handler(errorValue);
          return;
        }
      }
      handler(new Error(String(first ?? 'Unknown websocket error')));
    });
  }

  public onPong(handler: () => void): void {
    this.attach('pong', () => {
      handler();
    });
  }

  public ping(): void {
    if (this.supportsPing) {
      this.socket.ping?.();
    }
  }

  public toText(raw: unknown, depth = 0): string {
    if (typeof raw === 'string') {
      return raw;
    }
    if (raw instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(raw));
    }
    if (raw instanceof Uint8Array) {
      return new TextDecoder().decode(raw);
    }
    if (Array.isArray(raw)) {
      if (depth >= 10) {
        return '';
      }
      return raw.map((entry) => this.toText(entry, depth + 1)).join('');
    }
    return String(raw ?? '');
  }

  private attach(event: string, handler: EventHandler): void {
    if (typeof this.socket.on === 'function') {
      this.socket.on(event, handler);
      return;
    }
    if (typeof this.socket.addEventListener === 'function') {
      this.socket.addEventListener(event, handler as (event: unknown) => void);
    }
  }
}

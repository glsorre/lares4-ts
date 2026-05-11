import { Lares4Logger } from '../internal/lares4-logger';
import type { Lares4SocketLike } from '../../types';
import { Lares4SocketAdapter } from './socket-adapter';

function redactSentMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && parsed.CMD === 'LOGIN') {
      const payload = parsed.PAYLOAD as Record<string, unknown> | undefined;
      if (payload && typeof payload === 'object' && 'PIN' in payload) {
        return JSON.stringify({ ...parsed, PAYLOAD: { ...payload, PIN: '***' } });
      }
    }
    return raw;
  } catch {
    return raw;
  }
}

export class WsTransport {
  constructor(
    private readonly logger: Lares4Logger,
    private readonly onSent?: (raw: string) => void,
  ) {}

  public async send(ws: Lares4SocketLike | undefined, rawMessage: string): Promise<void> {
    if (!ws || !new Lares4SocketAdapter(ws).isOpen()) {
      throw new Error('WebSocket not connected');
    }

    await new Promise<void>((resolve, reject) => {
      // Node.js `ws` library supports an error callback; browser WebSocket.send() does not.
      // Detect by checking for the `on` event-emitter method which only Node ws exposes.
      const supportsCallback = typeof (ws as { on?: unknown }).on === 'function';
      if (supportsCallback) {
        ws.send(rawMessage, (error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          this.notifySent(rawMessage);
          resolve();
        });
      } else {
        try {
          ws.send(rawMessage);
          this.notifySent(rawMessage);
          resolve();
        } catch (err: unknown) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  private notifySent(rawMessage: string): void {
    if (this.onSent) {
      try {
        this.onSent(redactSentMessage(rawMessage));
      } catch (listenerError: unknown) {
        this.logger.warn(`onSent listener failed: ${listenerError instanceof Error ? listenerError.message : String(listenerError)}`);
      }
    }
  }

  public ping(ws: Lares4SocketLike | undefined): void {
    if (!ws) {
      return;
    }
    const adapter = new Lares4SocketAdapter(ws);
    if (!adapter.isOpen() || !adapter.supportsPing) {
      return;
    }
    try {
      adapter.ping();
    } catch (error: unknown) {
      this.logger.warn(`Heartbeat ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public close(ws: Lares4SocketLike | undefined, code: number, reason: string): void {
    if (!ws) {
      return;
    }
    try {
      ws.close(code, reason);
    } catch {
      ws.terminate?.();
    }
  }
}

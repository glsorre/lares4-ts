import WebSocket from 'ws';
import { Lares4Logger } from '../internal/lares4-logger';

export class WsTransport {
  constructor(private readonly logger: Lares4Logger) {}

  public async send(ws: WebSocket | undefined, rawMessage: string): Promise<void> {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    await new Promise<void>((resolve, reject) => {
      ws.send(rawMessage, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  public ping(ws: WebSocket | undefined): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      ws.ping();
    } catch (error: unknown) {
      this.logger.warn(`Heartbeat ping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public close(ws: WebSocket | undefined, code: number, reason: string): void {
    if (!ws) {
      return;
    }
    try {
      ws.close(code, reason);
    } catch {
      ws.terminate();
    }
  }
}

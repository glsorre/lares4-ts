import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSocket from 'ws';
import { WsTransport } from '../../../src/lib/core/transport';
import type { Lares4Logger } from '../../../src/lib/internal/lares4-logger';

describe('WsTransport', () => {
  it('rejects send when websocket is not connected', async () => {
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const transport = new WsTransport(logger);
    await assert.rejects(transport.send(undefined, 'hello'), /not connected/i);
  });

  it('logs warning when ping throws', () => {
    let warning = '';
    const logger = {
      warn: (message: string) => {
        warning = message;
      },
    } as unknown as Lares4Logger;
    const transport = new WsTransport(logger);
    const ws = {
      readyState: WebSocket.OPEN,
      ping: () => {
        throw new Error('broken ping');
      },
    } as unknown as WebSocket;

    transport.ping(ws);
    assert.match(warning, /Heartbeat ping failed/);
    assert.match(warning, /broken ping/);
  });

  it('falls back to terminate when close throws', () => {
    let terminated = 0;
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const transport = new WsTransport(logger);
    const ws = {
      close: () => {
        throw new Error('close failed');
      },
      terminate: () => {
        terminated += 1;
      },
    } as unknown as WebSocket;

    transport.close(ws, 1000, 'bye');
    assert.equal(terminated, 1);
  });
});

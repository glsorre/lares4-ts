import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
      readyState: 1,
      send: () => undefined,
      close: () => undefined,
      ping: () => {
        throw new Error('broken ping');
      },
    };

    transport.ping(ws);
    assert.match(warning, /Heartbeat ping failed/);
    assert.match(warning, /broken ping/);
  });

  it('falls back to terminate when close throws', () => {
    let terminated = 0;
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const transport = new WsTransport(logger);
    const ws = {
      readyState: 1,
      send: () => undefined,
      close: () => {
        throw new Error('close failed');
      },
      terminate: () => {
        terminated += 1;
      },
    };

    transport.close(ws, 1000, 'bye');
    assert.equal(terminated, 1);
  });

  it('invokes onSent callback once after a successful ack with the original frame', async () => {
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const sent: string[] = [];
    const transport = new WsTransport(logger, (raw) => {
      sent.push(raw);
    });
    const ws = {
      readyState: 1,
      on: () => undefined,
      send: (_data: string, cb?: (error?: Error) => void) => {
        cb?.();
      },
      close: () => undefined,
    };

    const frame = JSON.stringify({ CMD: 'READ', PAYLOAD: { foo: 'bar' } });
    await transport.send(ws, frame);
    assert.deepEqual(sent, [frame]);
  });

  it('does not invoke onSent when ws.send callback yields an error', async () => {
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    let calls = 0;
    const transport = new WsTransport(logger, () => {
      calls += 1;
    });
    const ws = {
      readyState: 1,
      on: () => undefined,
      send: (_data: string, cb?: (error?: Error) => void) => {
        cb?.(new Error('boom'));
      },
      close: () => undefined,
    };

    await assert.rejects(
      transport.send(ws, JSON.stringify({ CMD: 'READ', PAYLOAD: {} })),
      /boom/,
    );
    assert.equal(calls, 0);
  });

  it('redacts LOGIN.PAYLOAD.PIN before delivering to onSent', async () => {
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const sent: string[] = [];
    const transport = new WsTransport(logger, (raw) => {
      sent.push(raw);
    });
    const ws = {
      readyState: 1,
      on: () => undefined,
      send: (_data: string, cb?: (error?: Error) => void) => {
        cb?.();
      },
      close: () => undefined,
    };

    const login = JSON.stringify({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'LOGIN',
      ID: '1',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: { PIN: '123456' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    await transport.send(ws, login);
    assert.equal(sent.length, 1);
    const observed = JSON.parse(sent[0]) as { CMD: string; PAYLOAD: { PIN: string } };
    assert.equal(observed.CMD, 'LOGIN');
    assert.equal(observed.PAYLOAD.PIN, '***');
  });

  it('does not redact non-LOGIN frames carrying PIN token markers', async () => {
    const logger = { warn: () => undefined } as unknown as Lares4Logger;
    const sent: string[] = [];
    const transport = new WsTransport(logger, (raw) => {
      sent.push(raw);
    });
    const ws = {
      readyState: 1,
      on: () => undefined,
      send: (_data: string, cb?: (error?: Error) => void) => {
        cb?.();
      },
      close: () => undefined,
    };

    const cmd = JSON.stringify({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'CMD_USR',
      ID: '2',
      PAYLOAD_TYPE: 'CMD_SET_OUTPUT',
      PAYLOAD: { PIN: 'true', ID_LOGIN: 'true' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    await transport.send(ws, cmd);
    assert.equal(sent[0], cmd);
  });

  it('swallows listener errors so a throwing onSent does not break send', async () => {
    const warnings: string[] = [];
    const logger = {
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as Lares4Logger;
    const transport = new WsTransport(logger, () => {
      throw new Error('listener kaboom');
    });
    const ws = {
      readyState: 1,
      on: () => undefined,
      send: (_data: string, cb?: (error?: Error) => void) => {
        cb?.();
      },
      close: () => undefined,
    };

    await transport.send(ws, JSON.stringify({ CMD: 'READ', PAYLOAD: {} }));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /onSent listener failed/);
    assert.match(warnings[0], /listener kaboom/);
  });
});

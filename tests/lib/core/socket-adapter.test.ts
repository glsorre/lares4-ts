import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4SocketAdapter } from '../../../src/lib/core/socket-adapter';

describe('Lares4SocketAdapter', () => {
  it('normalizes event-emitter style sockets', () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const socket = {
      readyState: 1,
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      ping: () => undefined,
      send: () => undefined,
      close: () => undefined,
    };
    const adapter = new Lares4SocketAdapter(socket);
    let received = '';
    let closeReason = '';
    adapter.onMessage((raw) => {
      received = adapter.toText(raw);
    });
    adapter.onClose((_code, reason) => {
      closeReason = reason ?? '';
    });
    handlers.get('message')?.('hello');
    handlers.get('close')?.(1006, Buffer.from('bye'));
    assert.equal(received, 'hello');
    assert.equal(closeReason, 'bye');
    assert.equal(adapter.supportsPing, true);
  });

  it('normalizes event-target style sockets', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const socket = {
      readyState: 1,
      addEventListener: (event: string, handler: (event: unknown) => void) => {
        listeners.set(event, handler);
      },
      send: () => undefined,
      close: () => undefined,
    };
    const adapter = new Lares4SocketAdapter(socket);
    let opened = 0;
    let closedCode = 0;
    adapter.onOpen(() => {
      opened += 1;
    });
    adapter.onClose((code) => {
      closedCode = code ?? 0;
    });
    listeners.get('open')?.({});
    listeners.get('close')?.({ code: 1000, reason: 'normal' });
    assert.equal(opened, 1);
    assert.equal(closedCode, 1000);
    assert.equal(adapter.supportsPing, false);
  });
});

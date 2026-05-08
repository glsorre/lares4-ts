import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4Socket } from '../../../src/lib/public/lares4-socket';
import type { Lares4Logger } from '../../../src/lib/internal/lares4-logger';
import { Lares4SocketEventType } from '../../../src/types';

function createSocketWithClientStub(stub: {
  send?: (...args: unknown[]) => Promise<void>;
  sendDeviceCommand?: (...args: unknown[]) => Promise<void>;
  open?: () => Promise<void>;
  close?: () => void;
  sender?: string;
  messages?: { emit: (evt: unknown) => void };
}) {
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as unknown as Lares4Logger;
  const socket = new Lares4Socket('sender', '1234', '127.0.0.1', true, logger, {
    port: 443,
    heartbeat_interval_ms: 1000,
    reconnect_delay_ms: 1000,
  });

  (socket as unknown as { _client: unknown })._client = {
    sender: stub.sender ?? 'sender',
    send: stub.send ?? (async () => undefined),
    sendDeviceCommand: stub.sendDeviceCommand ?? (async () => undefined),
    open: stub.open ?? (async () => undefined),
    close: stub.close ?? (() => undefined),
    messages: stub.messages ?? { emit: () => undefined },
  };
  socket.messages = stub.messages ?? { emit: () => undefined };
  return socket;
}

describe('Lares4Socket adapter', () => {
  it('routes OUTPUT payload through sendDeviceCommand', async () => {
    const calls: unknown[][] = [];
    const socket = createSocketWithClientStub({
      sendDeviceCommand: async (...args: unknown[]) => {
        calls.push(args);
      },
    });
    socket.send('CMD_USR', 'CMD_SET_OUTPUT', {
      ID_LOGIN: 'true',
      OUTPUT: { ID: '12', STA: 'ON' },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '12');
  });

  it('adds WRITE_CFG ack options for thermostat writes', async () => {
    const calls: unknown[][] = [];
    const socket = createSocketWithClientStub({
      sendDeviceCommand: async (...args: unknown[]) => {
        calls.push(args);
      },
    });
    socket.send('WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '8', ACT_MODE: 'MAN' }],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const options = calls[0][4] as { awaitResponse?: boolean; responseCmds?: string[] };
    assert.equal(options.awaitResponse, true);
    assert.deepEqual(options.responseCmds, ['WRITE_CFG_RES']);
  });

  it('emits ERROR when command fails', async () => {
    const emitted: unknown[] = [];
    const socket = createSocketWithClientStub({
      sendDeviceCommand: async () => {
        throw new Error('boom');
      },
      messages: {
        emit: (evt: unknown) => emitted.push(evt),
      },
    });

    socket.send('CMD_USR', 'CMD_SET_OUTPUT', {
      ID_LOGIN: 'true',
      OUTPUT: { ID: '12', STA: 'ON' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorEvent = emitted[0] as { type: string; message: string };
    assert.equal(errorEvent.type, Lares4SocketEventType.ERROR);
    assert.match(errorEvent.message, /boom/);
  });
});

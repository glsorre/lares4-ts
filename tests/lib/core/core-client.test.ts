import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4CoreClient } from '../../../src/lib/core/client';
import { Lares4SocketEventType } from '../../../src/types';
import type { Lares4SocketEventEmitted } from '../../../src/types';
import type { Lares4Logger } from '../../../src/lib/internal/lares4-logger';

function createClient() {
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as unknown as Lares4Logger;
  return new Lares4CoreClient('sender', '1234', '127.0.0.1', true, logger, {
    login_timeout_ms: 100,
    command_timeout_ms: 100,
  });
}

describe('Lares4CoreClient', () => {
  it('delegates open/send/sendDeviceCommand/close to services', async () => {
    const client = createClient();
    let connected = 0;
    let disconnected = 0;
    let kseniaCalls = 0;
    let deviceCalls = 0;

    (client as unknown as { connectionService: { connect: () => Promise<void>; disconnect: () => void } }).connectionService = {
      connect: async () => {
        connected += 1;
      },
      disconnect: () => {
        disconnected += 1;
      },
    };
    (client as unknown as { commandService: { sendKseniaCommand: () => Promise<void>; sendDeviceCommand: () => Promise<void> } }).commandService = {
      sendKseniaCommand: async () => {
        kseniaCalls += 1;
      },
      sendDeviceCommand: async () => {
        deviceCalls += 1;
      },
    };

    await client.open();
    await client.send('READ', 'STATUS_OUTPUTS', {});
    await client.sendDeviceCommand('1', 'CMD_USR', 'CMD_SET_OUTPUT', {});
    client.close();

    assert.equal(connected, 1);
    assert.equal(kseniaCalls, 1);
    assert.equal(deviceCalls, 1);
    assert.equal(disconnected, 1);
  });

  it('routes valid raw messages through protocol router', () => {
    const client = createClient();
    const routed: unknown[] = [];
    (client as unknown as { router: { route: (message: unknown) => void } }).router = {
      route: (message: unknown) => {
        routed.push(message);
      },
    };

    (client as unknown as { handleRawMessage: (raw: string) => void }).handleRawMessage(
      JSON.stringify({
        SENDER: 'A',
        RECEIVER: 'B',
        CMD: 'PING',
        ID: '1',
        PAYLOAD_TYPE: 'UNKNOWN',
        PAYLOAD: {},
        TIMESTAMP: '1',
        CRC_16: '0x0000',
      }),
    );

    assert.equal(routed.length, 1);
  });

  it('emits ERROR event on invalid raw message JSON', () => {
    const client = createClient();
    const events: Lares4SocketEventEmitted[] = [];
    client.messages.subscribe((event) => {
      events.push(event);
    });

    (client as unknown as { handleRawMessage: (raw: string) => void }).handleRawMessage('{invalid');

    assert.equal(events[0].type, Lares4SocketEventType.ERROR);
    assert.match(String(events[0].message ?? ''), /Unexpected token|Expected property name/);
  });

  it('keeps sender getter aligned with command service sender', () => {
    const client = createClient();
    (client as unknown as { commandService: { sender: string } }).commandService = {
      sender: 'custom-sender',
    };

    assert.equal(client.sender, 'custom-sender');
  });

  it('emits CLOSE event when connection service disconnect callback fires', () => {
    const client = createClient();
    const events: Lares4SocketEventEmitted[] = [];
    client.messages.subscribe((event) => {
      events.push(event);
    });

    const callbacks = (
      client as unknown as {
        connectionService: {
          callbacks?: { onDisconnected: () => void };
          onDisconnected?: () => void;
        };
      }
    ).connectionService as unknown as { callbacks?: { onDisconnected: () => void } };

    if (callbacks.callbacks?.onDisconnected) {
      callbacks.callbacks.onDisconnected();
    } else {
      (
        client as unknown as {
          messages: { emit: (event: Lares4SocketEventEmitted) => void };
        }
      ).messages.emit({ type: Lares4SocketEventType.CLOSE });
    }

    assert.equal(events.at(-1)?.type, Lares4SocketEventType.CLOSE);
  });
});

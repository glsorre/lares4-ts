import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProtocolRouter } from '../../../src/lib/core/protocol-router';
import { CommandDispatcher } from '../../../src/lib/core/command-dispatcher';

describe('ProtocolRouter', () => {
  it('routes core message types correctly', () => {
    const counters = {
      onResponse: 0,
      onLoginResponse: 0,
      onReadResponse: 0,
      onRealtimeResponse: 0,
      onStatusUpdate: 0,
      onPing: 0,
      onUnhandled: 0,
    };
    const router = new ProtocolRouter({
      onResponse: () => {
        counters.onResponse += 1;
      },
      onLoginResponse: () => {
        counters.onLoginResponse += 1;
      },
      onReadResponse: () => {
        counters.onReadResponse += 1;
      },
      onRealtimeResponse: () => {
        counters.onRealtimeResponse += 1;
      },
      onStatusUpdate: () => {
        counters.onStatusUpdate += 1;
      },
      onPing: () => {
        counters.onPing += 1;
      },
      onUnhandled: () => {
        counters.onUnhandled += 1;
      },
    });

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'LOGIN_RES',
      ID: '1',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: { RESULT: 'OK' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    assert.equal(counters.onLoginResponse, 1);
    assert.equal(counters.onResponse, 0);

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'READ_RES',
      ID: '2',
      PAYLOAD_TYPE: 'MULTI_TYPES',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    assert.equal(counters.onReadResponse, 1);

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'REALTIME_RES',
      ID: '3',
      PAYLOAD_TYPE: 'REGISTER',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    assert.equal(counters.onRealtimeResponse, 1);

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'STATUS_UPDATE',
      ID: '4',
      PAYLOAD_TYPE: 'CHANGES',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    assert.equal(counters.onStatusUpdate, 1);

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'PING',
      ID: '5',
      PAYLOAD_TYPE: 'HEARTBEAT',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    assert.equal(counters.onPing, 1);
  });

  it('routes unknown commands to unhandled and still handles generic _RES responses', () => {
    let onResponse = 0;
    let onUnhandled = 0;
    const router = new ProtocolRouter({
      onResponse: () => {
        onResponse += 1;
      },
      onLoginResponse: () => undefined,
      onReadResponse: () => undefined,
      onRealtimeResponse: () => undefined,
      onStatusUpdate: () => undefined,
      onPing: () => undefined,
      onUnhandled: () => {
        onUnhandled += 1;
      },
    });

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'CUSTOM_RES',
      ID: '10',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'SOMETHING_UNKNOWN',
      ID: '11',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(onResponse, 1);
    assert.equal(onUnhandled, 1);
  });

  it('routes REALTIME without _RES suffix to onStatusUpdate only', () => {
    let onResponse = 0;
    let onStatusUpdate = 0;
    let onUnhandled = 0;
    const router = new ProtocolRouter({
      onResponse: () => {
        onResponse += 1;
      },
      onLoginResponse: () => undefined,
      onReadResponse: () => undefined,
      onRealtimeResponse: () => undefined,
      onStatusUpdate: () => {
        onStatusUpdate += 1;
      },
      onPing: () => undefined,
      onUnhandled: () => {
        onUnhandled += 1;
      },
    });

    router.route({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'REALTIME',
      ID: '9',
      PAYLOAD_TYPE: 'CHANGES',
      PAYLOAD: {},
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(onResponse, 0);
    assert.equal(onStatusUpdate, 1);
    assert.equal(onUnhandled, 0);
  });
});

describe('CommandDispatcher', () => {
  it('serializes per-device queue', async () => {
    const dispatcher = new CommandDispatcher();
    const order: string[] = [];
    await Promise.all([
      dispatcher.enqueuePerDevice('light_1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('first');
      }),
      dispatcher.enqueuePerDevice('light_1', async () => {
        order.push('second');
      }),
    ]);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('resolves pending command on matching id/cmd', async () => {
    const dispatcher = new CommandDispatcher();
    const pending = dispatcher.registerPending('42', 1000, ['WRITE_CFG_RES']);
    dispatcher.resolvePending({ ID: '42', CMD: 'WRITE_CFG_RES' });
    await pending;
  });

  it('rejects pending command on timeout', async () => {
    const dispatcher = new CommandDispatcher();
    await assert.rejects(
      dispatcher.registerPending('42', 1, ['WRITE_CFG_RES']),
      /timed out/,
    );
  });

  it('resolves a single compatible pending command when id differs', async () => {
    const dispatcher = new CommandDispatcher();
    const pending = dispatcher.registerPending('42', 1000, ['WRITE_CFG_RES']);
    dispatcher.resolvePending({ ID: '999', CMD: 'WRITE_CFG_RES' });
    await pending;
  });

  it('does not resolve pending command when multiple compatible candidates exist', async () => {
    const dispatcher = new CommandDispatcher();
    const first = dispatcher.registerPending('42', 15, ['WRITE_CFG_RES']);
    const second = dispatcher.registerPending('43', 15, ['WRITE_CFG_RES']);

    dispatcher.resolvePending({ ID: '999', CMD: 'WRITE_CFG_RES' });

    await assert.rejects(first, /timed out/);
    await assert.rejects(second, /timed out/);
  });

  it('rejects all pending commands when rejectAll is invoked', async () => {
    const dispatcher = new CommandDispatcher();
    const pending = dispatcher.registerPending('100', 1000, ['CMD_USR_RES']);

    dispatcher.rejectAll(new Error('Client disconnected'));

    await assert.rejects(pending, /Client disconnected/);
  });

  it('ignores late ACK when command type does not match current pending expectation', async () => {
    const dispatcher = new CommandDispatcher();
    await assert.rejects(
      dispatcher.registerPending('old', 1, ['WRITE_CFG_RES']),
      /timed out/,
    );

    const current = dispatcher.registerPending('new', 100, ['CMD_USR_RES']);
    dispatcher.resolvePending({ ID: 'old', CMD: 'WRITE_CFG_RES' });

    let resolved = false;
    current.then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(resolved, false);

    dispatcher.resolvePending({ ID: 'new', CMD: 'CMD_USR_RES' });
    await current;
  });

  it('resolves out-of-order ACKs by matching pending command id first', async () => {
    const dispatcher = new CommandDispatcher();
    const first = dispatcher.registerPending('41', 100, ['WRITE_CFG_RES']);
    const second = dispatcher.registerPending('42', 100, ['WRITE_CFG_RES']);

    dispatcher.resolvePending({ ID: '42', CMD: 'WRITE_CFG_RES' });
    await second;

    let firstResolved = false;
    first.then(() => {
      firstResolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(firstResolved, false);

    dispatcher.resolvePending({ ID: '41', CMD: 'WRITE_CFG_RES' });
    await first;
  });
});

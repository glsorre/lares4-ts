import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CommandService } from '../../../src/lib/core/command-service';
import { createInitialCoreState } from '../../../src/lib/core/state';
import { Lares4CommandFactory } from '../../../src/lib/internal/lares4-command-factory';
import { Lares4Logger } from '../../../src/lib/internal/lares4-logger';
import { CommandDispatcher } from '../../../src/lib/core/command-dispatcher';
import { WsTransport } from '../../../src/lib/core/transport';
import { Lares4ConnectionError } from '../../../src/lib/core/errors';

describe('CommandService', () => {
  it('injects runtime ID_LOGIN into outgoing commands', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;

    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        calls.push(payload);
      },
    } as unknown as WsTransport;

    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await service.sendKseniaCommand('READ', 'STATUS_OUTPUTS', { ID_LOGIN: 'true' });

    assert.match(calls[0], /"ID_LOGIN":"777"/);
  });

  it('throws when requesting initial data without login id', async () => {
    const state = createInitialCoreState();
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    const dispatcher = new CommandDispatcher();
    const transport = { send: async () => undefined } as unknown as WsTransport;
    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await assert.rejects(() => service.requestInitialData(), /ID_LOGIN not available/);
  });

  it('requests initial data using documented sequence and payload types', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: Array<{ cmd: string; payloadType: string }> = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        const parsed = JSON.parse(payload) as { CMD: string; PAYLOAD_TYPE: string };
        calls.push({ cmd: parsed.CMD, payloadType: parsed.PAYLOAD_TYPE });
      },
    } as unknown as WsTransport;
    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await service.requestInitialData();

    assert.deepEqual(calls, [
      { cmd: 'READ', payloadType: 'CFG_THERMOSTATS' },
      { cmd: 'READ', payloadType: 'PRG_THERMOSTATS' },
    ]);
  });

  it('remaps thermostat id for CFG_ALL writes', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    state.thermostatProgramIdByOutputId.set('8', '99');

    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        calls.push(payload);
      },
    } as unknown as WsTransport;

    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);
    await service.sendDeviceCommand('thermostat_8', 'WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '8', ACT_MODE: 'MAN' }],
    });

    assert.match(calls[0], /"ID":"99"/);
  });

  it('prefers thermostatProgramIdByOutputId over cached thermostatCommandIdByOutputId for CFG_ALL writes', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    state.thermostatProgramIdByOutputId.set('21', '3');
    state.thermostatCommandIdByOutputId.set('21', '4');

    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        calls.push(payload);
      },
    } as unknown as WsTransport;

    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);
    await service.sendDeviceCommand('thermostat_21', 'WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '21', ACT_MODE: 'MAN' }],
    });

    assert.match(calls[0], /"ID":"3"/);
    assert.equal(state.thermostatCommandIdByOutputId.get('21'), '3');
  });

  it('falls back to raw output id when no mapping exists for CFG_ALL writes', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;

    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        calls.push(payload);
      },
    } as unknown as WsTransport;

    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);
    await service.sendDeviceCommand('thermostat_19', 'WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '19', ACT_MODE: 'MAN' }],
    });

    assert.match(calls[0], /"ID":"19"/);
    assert.equal(state.thermostatCommandIdByOutputId.get('19'), '19');
  });

  it('reuses cached thermostatCommandIdByOutputId on subsequent CFG_ALL writes when no program mapping is available', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    state.thermostatCommandIdByOutputId.set('21', '3');

    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const dispatcher = new CommandDispatcher();
    const calls: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        calls.push(payload);
      },
    } as unknown as WsTransport;

    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);
    await service.sendDeviceCommand('thermostat_21', 'WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '21', ACT_MODE: 'MAN' }],
    });
    await service.sendDeviceCommand('thermostat_21', 'WRITE_CFG', 'CFG_ALL', {
      ID_LOGIN: 'true',
      CFG_THERMOSTATS: [{ ID: '21', ACT_MODE: 'OFF' }],
    });

    assert.match(calls[0], /"ID":"3"/);
    assert.match(calls[1], /"ID":"3"/);
  });

  it('waits for pending response when awaitResponse is enabled', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    const transport = { send: async () => undefined } as unknown as WsTransport;
    let registered: { id: string; timeoutMs: number; responseCmds?: string[] } | undefined;
    const dispatcher = {
      registerPending: (id: string, timeoutMs: number, responseCmds?: string[]) => {
        registered = { id, timeoutMs, responseCmds };
        return Promise.resolve();
      },
      clearPending: () => undefined,
    } as unknown as CommandDispatcher;
    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await service.sendKseniaCommand('WRITE_CFG', 'CFG_ALL', { ID_LOGIN: 'true' }, {
      awaitResponse: true,
      timeoutMs: 1500,
      responseCmds: ['WRITE_CFG_RES'],
    });

    assert.equal(registered?.timeoutMs, 1500);
    assert.deepEqual(registered?.responseCmds, ['WRITE_CFG_RES']);
  });

  it('clears pending command when transport send fails', async () => {
    const state = createInitialCoreState();
    state.idLogin = '777';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '777';
    let clearedId = '';
    const dispatcher = {
      registerPending: () => Promise.resolve(),
      clearPending: (id: string) => {
        clearedId = id;
      },
    } as unknown as CommandDispatcher;
    const transport = {
      send: async () => {
        throw new Error('send failed');
      },
    } as unknown as WsTransport;
    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await assert.rejects(
      service.sendKseniaCommand('WRITE_CFG', 'CFG_ALL', { ID_LOGIN: 'true' }, { awaitResponse: true }),
      /send failed/,
    );
    assert.equal(clearedId, '1');
  });

  it('throws Lares4ConnectionError when websocket is not connected', async () => {
    const state = createInitialCoreState();
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger;
    const factory = new Lares4CommandFactory('sender', '1234');
    const dispatcher = new CommandDispatcher();
    const transport = { send: async () => undefined } as unknown as WsTransport;
    const service = new CommandService(state, factory, logger, dispatcher, transport, 500);

    await assert.rejects(service.sendKseniaCommand('READ', 'STATUS_OUTPUTS', { ID_LOGIN: 'true' }), (error: unknown) => {
      assert.ok(error instanceof Lares4ConnectionError);
      return true;
    });
  });
});

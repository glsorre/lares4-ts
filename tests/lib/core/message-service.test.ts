import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MessageService } from '../../../src/lib/core/message-service';
import { createInitialCoreState } from '../../../src/lib/core/state';
import { Lares4SocketEventType } from '../../../src/types';
import type { Lares4Logger } from '../../../src/lib/internal/lares4-logger';
import type { CommandService } from '../../../src/lib/core/command-service';
import { TypedEmitter } from '../../../src/lib/core/typed-emitter';

describe('MessageService', () => {
  it('handles login success and triggers initial data request', async () => {
    const state = createInitialCoreState();
    let sessionId = '';
    let requested = 0;
    let loginCompleted = 0;
    const events: string[] = [];
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    messages.subscribe((event) => {
      events.push(event.type);
    });

    const commandService = {
      replaceSessionLogin: (id: string) => {
        sessionId = id;
      },
      requestInitialData: async () => {
        requested += 1;
      },
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    let loginResolved = 0;
    state.pendingLogin = {
      timeout: setTimeout(() => undefined, 1),
      resolve: () => {
        loginResolved += 1;
      },
      reject: () => undefined,
    };

    const service = new MessageService(
      state,
      commandService,
      logger,
      messages as never,
      () => {
        loginCompleted += 1;
      },
    );

    service.handleLoginResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'LOGIN_RES',
      ID: '1',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: { RESULT: 'OK', ID_LOGIN: '77' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.idLogin, '77');
    assert.equal(sessionId, '77');
    assert.equal(loginResolved, 1);
    assert.equal(loginCompleted, 1);
    assert.equal(requested, 1);
    assert.deepEqual(events, [Lares4SocketEventType.OPEN]);
  });

  it('loads thermostat mappings from PRG_THERMOSTATS', () => {
    const state = createInitialCoreState();
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '1',
      PAYLOAD_TYPE: 'PRG_THERMOSTATS',
      PAYLOAD: {
        PRG_THERMOSTATS: [
          { ID: '10', PERIPH: { PID: '33' }, HEATING_OUT: '8', COOLING_OUT: 'NU' },
        ],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(state.thermostatProgramIdByOutputId.get('8'), '10');
    assert.equal(state.domusSensorIdByThermostatProgramId.get('10'), '33');
  });

  it('rejects pending login and does not emit OPEN when login fails', async () => {
    const state = createInitialCoreState();
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    const events: string[] = [];
    messages.subscribe((event) => {
      events.push(event.type);
    });
    let requested = 0;
    let loginCompleted = 0;
    let rejectedMessage = '';
    let loggedError = '';
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => {
        requested += 1;
      },
    } as unknown as CommandService;
    const logger = {
      error: (message: string) => {
        loggedError = message;
      },
    } as unknown as Lares4Logger;
    state.pendingLogin = {
      timeout: setTimeout(() => undefined, 1),
      resolve: () => undefined,
      reject: (error: Error) => {
        rejectedMessage = error.message;
      },
    };

    const service = new MessageService(
      state,
      commandService,
      logger,
      messages as never,
      () => {
        loginCompleted += 1;
      },
    );

    service.handleLoginResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'LOGIN_RES',
      ID: '1',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: { RESULT: 'KO', RESULT_DETAIL: 'bad pin' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(rejectedMessage, /Login failed: bad pin/);
    assert.equal(loginCompleted, 0);
    assert.equal(requested, 0);
    assert.deepEqual(events, []);
    assert.match(loggedError, /bad pin/);
  });

  it('ignores malformed thermostat entries safely', () => {
    const state = createInitialCoreState();
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '1',
      PAYLOAD_TYPE: 'CFG_THERMOSTATS',
      PAYLOAD: {
        CFG_THERMOSTATS: [null, 'bad', { ID: '' }, { ID: '7', NAME: 'ok' }],
      } as never,
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '2',
      PAYLOAD_TYPE: 'PRG_THERMOSTATS',
      PAYLOAD: {
        PRG_THERMOSTATS: [
          { ID: '' },
          { ID: '11', HEATING_OUT: 'NU', COOLING_OUT: 'NU' },
          { ID: '12', HEATING_OUT: '8', PERIPH: { PID: '4' } },
        ],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(state.thermostatCfgById.size, 1);
    assert.ok(state.thermostatCfgById.has('7'));
    assert.equal(state.thermostatProgramIdByOutputId.size, 1);
    assert.equal(state.thermostatProgramIdByOutputId.get('8'), '12');
    assert.equal(state.domusSensorIdByThermostatProgramId.get('12'), '4');
  });

  it('emits MULTI_TYPES event for multi type reads', () => {
    const state = createInitialCoreState();
    const events: string[] = [];
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    messages.subscribe((event) => {
      events.push(event.type);
    });
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '1',
      PAYLOAD_TYPE: 'MULTI_TYPES',
      PAYLOAD: { OUTPUTS: [] },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.deepEqual(events, [Lares4SocketEventType.MULTI_TYPES]);
  });

  it('emits CHANGE for STATUS_* reads and realtime/status updates', () => {
    const state = createInitialCoreState();
    const events: string[] = [];
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    messages.subscribe((event) => {
      events.push(event.type);
    });
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '1',
      PAYLOAD_TYPE: 'STATUS_OUTPUTS',
      PAYLOAD: { STATUS_OUTPUTS: [] },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleRealtimeResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'REALTIME_RES',
      ID: '2',
      PAYLOAD_TYPE: 'REGISTER',
      PAYLOAD: { test: true },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleStatusUpdate({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'STATUS_UPDATE',
      ID: '3',
      PAYLOAD_TYPE: 'UNKNOWN',
      PAYLOAD: { test: true },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.deepEqual(events, [
      Lares4SocketEventType.CHANGE,
      Lares4SocketEventType.CHANGE,
      Lares4SocketEventType.CHANGE,
    ]);
    assert.equal(state.hasCompletedInitialSync, true);
  });

  it('applies realistic MULTI_TYPES -> PRG -> CFG -> REGISTER_ACK -> CHANGES sequence', () => {
    const state = createInitialCoreState();
    const events: string[] = [];
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    messages.subscribe((event) => {
      events.push(event.type);
    });
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '1',
      PAYLOAD_TYPE: 'MULTI_TYPES',
      PAYLOAD: {
        OUTPUTS: [{ ID: '21', TYPE: 'THERM' }],
        BUS_HAS: [{ ID: '01', TYPE: 'DOMUS' }],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '2',
      PAYLOAD_TYPE: 'PRG_THERMOSTATS',
      PAYLOAD: {
        PRG_THERMOSTATS: [{ ID: '3', PERIPH: { PID: '1' }, HEATING_OUT: '21', COOLING_OUT: '34' }],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '3',
      PAYLOAD_TYPE: 'CFG_THERMOSTATS',
      PAYLOAD: {
        CFG_THERMOSTATS: [{ ID: '3', ACT_MODE: 'MAN', ACT_SEA: 'SUM' }],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleRealtimeResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'REALTIME_RES',
      ID: '4',
      PAYLOAD_TYPE: 'REGISTER_ACK',
      PAYLOAD: {
        STATUS_TEMPERATURES: [{ ID: '3', TEMP: '24,0' }],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    service.handleStatusUpdate({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'REALTIME',
      ID: '5',
      PAYLOAD_TYPE: 'CHANGES',
      PAYLOAD: {
        panel: {
          STATUS_BUS_HA_SENSORS: [{ ID: '1', DOMUS: { TEM: '24,0' } }],
          STATUS_SYSTEM: [{ ID: '1', TEMP: { IN: '18.0' } }],
        },
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(state.thermostatProgramIdByOutputId.get('21'), '3');
    assert.equal(state.thermostatProgramIdByOutputId.get('34'), '3');
    assert.equal(state.domusSensorIdByThermostatProgramId.get('3'), '1');
    assert.ok(state.thermostatCfgById.has('3'));
    assert.equal(state.hasCompletedInitialSync, true);
    assert.deepEqual(events, [
      Lares4SocketEventType.MULTI_TYPES,
      Lares4SocketEventType.CHANGE,
      Lares4SocketEventType.CHANGE,
    ]);
  });

  it('replaces stale PRG mappings on a fresh PRG_THERMOSTATS read', () => {
    const state = createInitialCoreState();
    state.thermostatProgramIdByOutputId.set('old-output', 'old-prg');
    state.domusSensorIdByThermostatProgramId.set('old-prg', '9');
    const messages = new TypedEmitter<{ type: Lares4SocketEventType }>();
    const commandService = {
      replaceSessionLogin: () => undefined,
      requestInitialData: async () => undefined,
    } as unknown as CommandService;
    const logger = { error: () => undefined } as unknown as Lares4Logger;
    const service = new MessageService(state, commandService, logger, messages as never, () => undefined);

    service.handleReadResponse({
      SENDER: 'a',
      RECEIVER: 'b',
      CMD: 'READ_RES',
      ID: '10',
      PAYLOAD_TYPE: 'PRG_THERMOSTATS',
      PAYLOAD: {
        PRG_THERMOSTATS: [{ ID: '2', PERIPH: { PID: '4' }, HEATING_OUT: '18' }],
      },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });

    assert.equal(state.thermostatProgramIdByOutputId.size, 1);
    assert.equal(state.thermostatProgramIdByOutputId.get('18'), '2');
    assert.equal(state.domusSensorIdByThermostatProgramId.size, 1);
    assert.equal(state.domusSensorIdByThermostatProgramId.get('2'), '4');
  });
});

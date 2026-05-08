import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSocket from 'ws';
import { createInitialCoreState } from '../../../src/lib/core/state';
import { TypedEmitter } from '../../../src/lib/core/typed-emitter';
import { MessageService } from '../../../src/lib/core/message-service';
import { ProtocolRouter } from '../../../src/lib/core/protocol-router';
import { CommandService } from '../../../src/lib/core/command-service';
import { CommandDispatcher } from '../../../src/lib/core/command-dispatcher';
import { Lares4CommandFactory } from '../../../src/lib/internal/lares4-command-factory';
import { Lares4SocketEventType } from '../../../src/types';
import type { Lares4Message, Lares4SocketEventEmitted } from '../../../src/types';
import type { Lares4Logger } from '../../../src/lib/internal/lares4-logger';

function createLogger(): Lares4Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  } as unknown as Lares4Logger;
}

function frame(
  cmd: string,
  payloadType: string,
  payload: Record<string, unknown>,
  id: string,
): Lares4Message {
  return {
    SENDER: 'panel',
    RECEIVER: 'client',
    CMD: cmd,
    ID: id,
    PAYLOAD_TYPE: payloadType,
    PAYLOAD: payload,
    TIMESTAMP: '1',
    CRC_16: '0x0000',
  };
}

describe('Protocol reliability integration', () => {
  it('applies startup lifecycle sequence in order', async () => {
    const state = createInitialCoreState();
    const events: string[] = [];
    const steps: string[] = [];
    const messages = new TypedEmitter<Lares4SocketEventEmitted>();
    messages.subscribe((event) => {
      events.push(event.type);
    });

    const commandService = {
      replaceSessionLogin: (id: string) => {
        steps.push(`replaceSessionLogin:${id}`);
      },
      requestInitialData: async () => {
        steps.push('requestInitialData');
      },
    } as unknown as CommandService;

    const messageService = new MessageService(
      state,
      commandService,
      createLogger(),
      messages,
      () => {
        steps.push('onLoginCompleted');
      },
    );
    const router = new ProtocolRouter({
      onResponse: () => undefined,
      onLoginResponse: (message) => messageService.handleLoginResponse(message),
      onReadResponse: (message) => messageService.handleReadResponse(message),
      onRealtimeResponse: (message) => messageService.handleRealtimeResponse(message),
      onStatusUpdate: (message) => messageService.handleStatusUpdate(message),
    });

    router.route(frame('LOGIN_RES', 'UNKNOWN', { RESULT: 'OK', ID_LOGIN: '77' }, '1'));
    router.route(frame('READ_RES', 'MULTI_TYPES', { OUTPUTS: [], BUS_HAS: [] }, '2'));
    router.route(frame('READ_RES', 'STATUS_OUTPUTS', { STATUS_OUTPUTS: [] }, '3'));
    router.route(frame('REALTIME_RES', 'REGISTER_ACK', { STATUS_TEMPERATURES: [] }, '4'));
    router.route(frame('REALTIME', 'CHANGES', { panel: { STATUS_OUTPUTS: [] } }, '5'));

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(steps, ['replaceSessionLogin:77', 'onLoginCompleted', 'requestInitialData']);
    assert.deepEqual(events, [
      Lares4SocketEventType.OPEN,
      Lares4SocketEventType.MULTI_TYPES,
      Lares4SocketEventType.CHANGE,
      Lares4SocketEventType.CHANGE,
      Lares4SocketEventType.CHANGE,
    ]);
    assert.equal(state.idLogin, '77');
    assert.equal(state.hasCompletedInitialSync, true);
  });

  it('replays login and register sequence after reconnect-style state reset', async () => {
    const state = createInitialCoreState();
    const events: string[] = [];
    const loginIds: string[] = [];
    let requestInitialDataCalls = 0;
    const messages = new TypedEmitter<Lares4SocketEventEmitted>();
    messages.subscribe((event) => {
      events.push(event.type);
    });

    const commandService = {
      replaceSessionLogin: (id: string) => {
        loginIds.push(id);
      },
      requestInitialData: async () => {
        requestInitialDataCalls += 1;
      },
    } as unknown as CommandService;

    const messageService = new MessageService(
      state,
      commandService,
      createLogger(),
      messages,
      () => undefined,
    );
    const router = new ProtocolRouter({
      onResponse: () => undefined,
      onLoginResponse: (message) => messageService.handleLoginResponse(message),
      onReadResponse: (message) => messageService.handleReadResponse(message),
      onRealtimeResponse: (message) => messageService.handleRealtimeResponse(message),
      onStatusUpdate: (message) => messageService.handleStatusUpdate(message),
    });

    router.route(frame('LOGIN_RES', 'UNKNOWN', { RESULT: 'OK', ID_LOGIN: '101' }, '1'));
    router.route(frame('REALTIME_RES', 'REGISTER_ACK', { STATUS_TEMPERATURES: [] }, '2'));
    assert.equal(state.hasCompletedInitialSync, true);

    state.idLogin = undefined;
    state.hasCompletedInitialSync = false;
    router.route(frame('LOGIN_RES', 'UNKNOWN', { RESULT: 'OK', ID_LOGIN: '202' }, '3'));
    router.route(frame('REALTIME_RES', 'REGISTER_ACK', { STATUS_TEMPERATURES: [] }, '4'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(loginIds, ['101', '202']);
    assert.equal(requestInitialDataCalls, 2);
    assert.equal(events.filter((type) => type === Lares4SocketEventType.OPEN).length, 2);
    assert.equal(state.idLogin, '202');
    assert.equal(state.hasCompletedInitialSync, true);
  });

  it('rejects in-flight awaitResponse command and allows subsequent sends', async () => {
    const state = createInitialCoreState();
    state.idLogin = '55';
    state.ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;

    const dispatcher = new CommandDispatcher();
    const sent: string[] = [];
    const transport = {
      send: async (_ws: WebSocket | undefined, payload: string) => {
        sent.push(payload);
      },
    };
    const service = new CommandService(
      state,
      new Lares4CommandFactory('sender', '1234'),
      createLogger(),
      dispatcher,
      transport as never,
      20,
    );
    service.replaceSessionLogin('55');

    const pending = service.sendKseniaCommand(
      'WRITE_CFG',
      'CFG_ALL',
      { ID_LOGIN: 'true', CFG_THERMOSTATS: [{ ID: '1', ACT_MODE: 'MAN' }] },
      { awaitResponse: true, timeoutMs: 200, responseCmds: ['WRITE_CFG_RES'] },
    );

    dispatcher.rejectAll(new Error('WebSocket closed (1006 - network)'));
    await assert.rejects(pending, /WebSocket closed/);

    await service.sendKseniaCommand('READ', 'STATUS_OUTPUTS', { ID_LOGIN: 'true' });
    assert.equal(sent.length, 2);
  });
});

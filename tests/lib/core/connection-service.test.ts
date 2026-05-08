import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectionService } from '../../../src/lib/core/connection-service';
import { createInitialCoreState } from '../../../src/lib/core/state';
import { CommandDispatcher } from '../../../src/lib/core/command-dispatcher';
import { WsTransport } from '../../../src/lib/core/transport';
import { Lares4Logger } from '../../../src/lib/internal/lares4-logger';

describe('ConnectionService', () => {
  const createLogger = () => (
    { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as Lares4Logger
  );

  it('resolves connection when login callback resolves pending login', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };

    const state = createInitialCoreState();
    let connectedCalls = 0;
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 50,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => {
          connectedCalls += 1;
        },
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const promise = service.connect();
    handlers.get('open')?.();
    await promise;
    assert.equal(connectedCalls, 1);
  });

  it('handles close events by rejecting pending commands and calling onDisconnected', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };

    const state = createInitialCoreState();
    let disconnectedCalls = 0;
    let rejectedMessage = '';
    const dispatcher = {
      rejectAll: (error: Error) => {
        rejectedMessage = error.message;
      },
      clearQueues: () => undefined,
    } as unknown as CommandDispatcher;
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 10000,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => {
          disconnectedCalls += 1;
        },
      },
      logger,
      transport,
      dispatcher,
    );

    const promise = service.connect();
    handlers.get('open')?.();
    await promise;
    handlers.get('close')?.(1006, Buffer.from('network'));
    assert.equal(disconnectedCalls, 1);
    assert.match(rejectedMessage, /WebSocket closed/);
  });

  it('rejects when login timeout is reached', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };

    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 50,
        loginTimeoutMs: 10,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => undefined,
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const promise = service.connect();
    handlers.get('open')?.();
    await assert.rejects(promise, /Login timeout/);
  });

  it('schedules reconnect with backoff and resets attempts after successful reconnect', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlersBySocket: Array<Map<string, Handler>> = [];
    const wsFactory = () => {
      const handlers = new Map<string, Handler>();
      handlersBySocket.push(handlers);
      return {
        on: (event: string, handler: Handler) => {
          handlers.set(event, handler);
        },
        close: () => undefined,
        readyState: 1,
      } as never;
    };
    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;
    let connectedCalls = 0;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 10,
        loginTimeoutMs: 100,
        wsFactory,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => {
          connectedCalls += 1;
        },
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const firstConnect = service.connect();
      handlersBySocket[0].get('open')?.();
      await firstConnect;
      state.reconnectAttempts = 1;

      handlersBySocket[0].get('close')?.(1006, Buffer.from('network'));
      assert.ok(state.reconnectTimer);
      await new Promise((resolve) => setTimeout(resolve, 25));
      handlersBySocket[1].get('open')?.();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(connectedCalls, 2);
      assert.equal(state.reconnectAttempts, 0);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('forces reconnect on heartbeat timeout and clears heartbeat timer', async () => {
    const state = createInitialCoreState();
    state.isConnected = true;
    let closeCode = 0;
    let rejectedMessage = '';
    const dispatcher = {
      rejectAll: (error: Error) => {
        rejectedMessage = error.message;
      },
      clearQueues: () => undefined,
    } as unknown as CommandDispatcher;
    const logger = createLogger();
    const transport = {
      ping: () => undefined,
      close: (_ws: unknown, code: number) => {
        closeCode = code;
      },
    } as unknown as WsTransport;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 5,
        reconnectDelayMs: 20,
        loginTimeoutMs: 50,
      },
      {
        executeLogin: async () => undefined,
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    service.startHeartbeat();
    state.heartbeatPending = true;
    state.lastPongReceived = Date.now() - 1000;
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(closeCode, 1001);
    assert.match(rejectedMessage, /heartbeat timeout/i);
    assert.equal(state.heartbeatTimer, undefined);
    assert.equal(state.isConnected, false);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
  });

  it('does not schedule reconnect after manual disconnect close event', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };

    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;

    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 10,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const promise = service.connect();
    handlers.get('open')?.();
    await promise;

    service.disconnect();
    handlers.get('close')?.(1000, Buffer.from('manual'));
    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(state.reconnectTimer, undefined);
    assert.equal(state.isManualClose, false);
  });

  it('rejects connect promise when websocket emits error during pending login', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };

    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;
    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 10,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => undefined,
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const promise = service.connect();
    handlers.get('open')?.();
    handlers.get('error')?.(new Error('socket exploded'));
    await assert.rejects(promise, /socket exploded/);
  });

  it('does not create duplicate reconnect timers when multiple close events occur', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };
    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;
    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 20,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const connectPromise = service.connect();
    handlers.get('open')?.();
    await connectPromise;

    handlers.get('close')?.(1006, Buffer.from('first'));
    const firstTimer = state.reconnectTimer;
    handlers.get('close')?.(1006, Buffer.from('second'));
    assert.equal(state.reconnectTimer, firstTimer);

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
  });

  it('keeps connection alive when pong arrives before heartbeat timeout window', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };
    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    let closeCalls = 0;
    const transport = {
      ping: () => undefined,
      close: () => {
        closeCalls += 1;
      },
    } as unknown as WsTransport;
    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 5,
        reconnectDelayMs: 20,
        loginTimeoutMs: 100,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => {
          state.pendingLogin?.resolve();
        },
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      },
      logger,
      transport,
      dispatcher,
    );

    const connectPromise = service.connect();
    handlers.get('open')?.();
    await connectPromise;
    service.startHeartbeat();
    await new Promise((resolve) => setTimeout(resolve, 6));
    handlers.get('pong')?.();
    await new Promise((resolve) => setTimeout(resolve, 6));

    assert.equal(closeCalls, 0);
    assert.equal(state.isConnected, true);

    service.disconnect();
    handlers.get('close')?.(1000, Buffer.from('manual'));
  });

  it('settles login timeout/close race deterministically', async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers = new Map<string, Handler>();
    const mockWs = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      close: () => undefined,
      readyState: 1,
    };
    const state = createInitialCoreState();
    const dispatcher = new CommandDispatcher();
    const logger = createLogger();
    const transport = { ping: () => undefined, close: () => undefined } as unknown as WsTransport;
    let disconnectedCalls = 0;
    const service = new ConnectionService(
      state,
      {
        ip: '127.0.0.1',
        port: 443,
        wss: true,
        heartbeatIntervalMs: 1000,
        reconnectDelayMs: 20,
        loginTimeoutMs: 5,
        wsFactory: () => mockWs as never,
      },
      {
        executeLogin: async () => undefined,
        onRawMessage: () => undefined,
        onConnected: () => undefined,
        onDisconnected: () => {
          disconnectedCalls += 1;
        },
      },
      logger,
      transport,
      dispatcher,
    );

    const connectPromise = service.connect();
    handlers.get('open')?.();
    await assert.rejects(connectPromise, /Login timeout/);
    handlers.get('close')?.(1006, Buffer.from('network'));

    assert.equal(state.pendingLogin, undefined);
    assert.equal(disconnectedCalls, 1);
    assert.ok(state.reconnectTimer);

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
  });
});

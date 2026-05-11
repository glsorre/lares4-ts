import { Lares4Logger } from '../internal/lares4-logger';
import type { Lares4CoreState } from './state';
import { WsTransport } from './transport';
import { CommandDispatcher } from './command-dispatcher';
import type { Lares4SocketLike, Lares4WsFactory } from '../../types';
import { Lares4SocketAdapter } from './socket-adapter';

interface ConnectionServiceOptions {
  ip: string;
  port: number;
  wss: boolean;
  heartbeatIntervalMs: number;
  reconnectDelayMs: number;
  loginTimeoutMs: number;
  wsFactory?: Lares4WsFactory;
  wsOptions?: Record<string, unknown>;
}

interface ConnectionServiceCallbacks {
  executeLogin: () => Promise<void>;
  onRawMessage: (raw: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class ConnectionService {
  private readonly maxReconnectDelayMs = 60000;

  constructor(
    private readonly state: Lares4CoreState,
    private readonly options: ConnectionServiceOptions,
    private readonly callbacks: ConnectionServiceCallbacks,
    private readonly logger: Lares4Logger,
    private readonly transport: WsTransport,
    private readonly dispatcher: CommandDispatcher,
  ) {}

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const rejectOnce = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      const protocol = this.options.wss ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${this.options.ip}:${this.options.port}/KseniaWsock/`;
      const wsCtor = this.options.wsFactory ?? this.createDefaultWsFactory();
      const ws = wsCtor(wsUrl, ['KS_WSOCK'], this.options.wsOptions);
      const adapter = new Lares4SocketAdapter(ws);

      this.state.ws = ws;
      this.logger.info(`Connecting to ${wsUrl}...`);

      adapter.onOpen(() => {
        this.state.isConnected = true;
        this.state.hasCompletedInitialSync = false;

        const timeout = setTimeout(() => {
          this.state.pendingLogin = undefined;
          rejectOnce(new Error(`Login timeout after ${this.options.loginTimeoutMs}ms`));
          if (this.state.ws && new Lares4SocketAdapter(this.state.ws).isOpen()) {
            this.state.ws.close(1000, 'Login timeout');
          }
        }, this.options.loginTimeoutMs);

        this.state.pendingLogin = {
          timeout,
          resolve: () => {
            clearTimeout(timeout);
            this.state.pendingLogin = undefined;
            this.callbacks.onConnected();
            resolveOnce();
          },
          reject: (error: Error) => {
            clearTimeout(timeout);
            this.state.pendingLogin = undefined;
            rejectOnce(error);
          },
        };

        this.callbacks.executeLogin().catch((error: unknown) => {
          this.state.pendingLogin?.reject(error instanceof Error ? error : new Error(String(error)));
        });
      });

      adapter.onMessage((data) => {
        try {
          this.callbacks.onRawMessage(adapter.toText(data));
        } catch (error: unknown) {
          this.logger.error(`Unhandled error in message handler: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      if (adapter.supportsPing) {
        adapter.onPong(() => {
          this.state.heartbeatPending = false;
          this.state.lastPongReceived = Date.now();
        });
      }

      adapter.onClose((code, reason) => {
        this.state.isConnected = false;
        this.state.idLogin = undefined;
        const reasonText = reason || 'No reason';
        this.dispatcher.rejectAll(new Error(`WebSocket closed (${code ?? 'unknown'} - ${reasonText})`));
        this.callbacks.onDisconnected();
        if (!this.state.isManualClose) {
          this.scheduleReconnect();
        }
        this.state.isManualClose = false;
      });

      adapter.onError((error) => {
        if (this.state.pendingLogin) {
          this.state.pendingLogin.reject(error);
          return;
        }
        rejectOnce(error);
      });
    });
  }

  public startHeartbeat(): void {
    if (this.state.heartbeatTimer) {
      clearInterval(this.state.heartbeatTimer);
    }
    this.state.lastPongReceived = Date.now();
    this.state.heartbeatPending = false;

    this.state.heartbeatTimer = setInterval(() => {
      if (!this.state.isConnected || !this.state.ws) {
        return;
      }

      const adapter = new Lares4SocketAdapter(this.state.ws);

      if (this.state.heartbeatPending) {
        const elapsed = Date.now() - this.state.lastPongReceived;
        if (elapsed > this.options.heartbeatIntervalMs * 2) {
          this.logger.warn(`Heartbeat timeout after ${elapsed}ms, forcing reconnect`);
          this.forceReconnect();
          return;
        }
      }

      if (!adapter.supportsPing) {
        this.state.heartbeatPending = false;
        this.state.lastPongReceived = Date.now();
        return;
      }

      this.state.heartbeatPending = true;
      this.transport.ping(this.state.ws);
    }, this.options.heartbeatIntervalMs);
  }

  public disconnect(): void {
    if (this.state.heartbeatTimer) {
      clearInterval(this.state.heartbeatTimer);
      this.state.heartbeatTimer = undefined;
    }
    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = undefined;
    }
    if (this.state.pendingLogin) {
      clearTimeout(this.state.pendingLogin.timeout);
      this.state.pendingLogin = undefined;
    }
    this.state.isManualClose = true;
    this.transport.close(this.state.ws, 1000, 'Client disconnect');
    this.state.idLogin = undefined;
    this.state.isConnected = false;
    this.dispatcher.clearQueues();
    this.dispatcher.rejectAll(new Error('Client disconnected'));
  }

  private scheduleReconnect(): void {
    if (this.state.reconnectTimer) {
      return;
    }
    const exponentialDelay = Math.min(
      this.options.reconnectDelayMs * Math.pow(2, this.state.reconnectAttempts),
      this.maxReconnectDelayMs,
    );
    const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);

    this.state.reconnectTimer = setTimeout(() => {
      this.state.reconnectTimer = undefined;
      this.state.reconnectAttempts += 1;
      this.connect()
        .then(() => {
          this.state.reconnectAttempts = 0;
        })
        .catch((error: unknown) => {
          this.logger.warn(`Reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
          this.scheduleReconnect();
        });
    }, delay);
  }

  private forceReconnect(): void {
    this.state.idLogin = undefined;
    this.state.heartbeatPending = false;
    this.dispatcher.rejectAll(new Error('Connection reset: heartbeat timeout'));
    if (this.state.heartbeatTimer) {
      clearInterval(this.state.heartbeatTimer);
      this.state.heartbeatTimer = undefined;
    }
    this.state.isManualClose = true;
    this.transport.close(this.state.ws, 1001, 'Heartbeat timeout');
    this.state.isConnected = false;
    this.scheduleReconnect();
  }

  private createDefaultWsFactory(): Lares4WsFactory {
    return (url, protocols) => {
      const wsCtor = globalThis.WebSocket;
      if (!wsCtor) {
        throw new Error('No default WebSocket available in runtime. Provide options.wsFactory.');
      }
      return new wsCtor(url, protocols) as unknown as Lares4SocketLike;
    };
  }
}

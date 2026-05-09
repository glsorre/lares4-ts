import type { Lares4SocketEventEmitted, Lares4SocketOptions, Lares4Message } from '../../types';
import { Lares4SocketEventType } from '../../types';
import { Lares4CommandFactory } from '../internal/lares4-command-factory';
import { Lares4Logger } from '../internal/lares4-logger';
import { createInitialCoreState, type Lares4CoreState } from './state';
import { WsTransport } from './transport';
import { CommandDispatcher } from './command-dispatcher';
import { CommandService } from './command-service';
import { ConnectionService } from './connection-service';
import { MessageService } from './message-service';
import { ProtocolRouter } from './protocol-router';
import { TypedEmitter } from './typed-emitter';

export class Lares4CoreClient {
  public readonly messages = new TypedEmitter<Lares4SocketEventEmitted>();

  private readonly state: Lares4CoreState;
  private readonly transport: WsTransport;
  private readonly dispatcher: CommandDispatcher;
  private readonly commandService: CommandService;
  private readonly connectionService: ConnectionService;
  private readonly messageService: MessageService;
  private readonly router: ProtocolRouter;

  constructor(
    sender: string,
    pin: string,
    ip: string,
    wss: boolean,
    private readonly logger: Lares4Logger,
    options: Lares4SocketOptions,
  ) {
    this.state = createInitialCoreState();
    this.transport = new WsTransport(logger);
    this.dispatcher = new CommandDispatcher();
    const commandFactory = new Lares4CommandFactory(sender, pin);
    this.commandService = new CommandService(
      this.state,
      commandFactory,
      logger,
      this.dispatcher,
      this.transport,
      options.command_timeout_ms ?? 8000,
    );

    this.messageService = new MessageService(
      this.state,
      this.commandService,
      logger,
      this.messages,
      () => {
        this.connectionService.startHeartbeat();
      },
    );

    this.router = new ProtocolRouter({
      onResponse: (message) => {
        this.dispatcher.resolvePending(message);
        this.messageService.handleCommandResponse(message);
      },
      onLoginResponse: (message) => this.messageService.handleLoginResponse(message),
      onReadResponse: (message) => this.messageService.handleReadResponse(message),
      onRealtimeResponse: (message) => this.messageService.handleRealtimeResponse(message),
      onStatusUpdate: (message) => this.messageService.handleStatusUpdate(message),
    });

    this.connectionService = new ConnectionService(
      this.state,
      {
        ip,
        port: options.port ?? (wss ? 443 : 80),
        wss,
        heartbeatIntervalMs: options.heartbeat_interval_ms ?? 30000,
        reconnectDelayMs: options.reconnect_delay_ms ?? 5000,
        loginTimeoutMs: options.login_timeout_ms ?? 10000,
      },
      {
        executeLogin: () => this.commandService.sendLogin(),
        onRawMessage: (raw) => this.handleRawMessage(raw),
        onConnected: () => undefined,
        onDisconnected: () => {
          this.messages.emit({ type: Lares4SocketEventType.CLOSE });
        },
      },
      logger,
      this.transport,
      this.dispatcher,
    );
  }

  get sender() {
    return this.commandService.sender;
  }

  public async open(): Promise<void> {
    await this.connectionService.connect();
  }

  public async send(
    cmd: string,
    payload_type: string,
    payload: Record<string, unknown>,
    options?: { awaitResponse?: boolean; timeoutMs?: number; responseCmds?: string[] },
  ): Promise<void> {
    await this.commandService.sendKseniaCommand(cmd, payload_type, payload, options);
  }

  public async sendDeviceCommand(
    deviceId: string,
    cmd: string,
    payloadType: string,
    payload: Record<string, unknown>,
    options?: { awaitResponse?: boolean; timeoutMs?: number; responseCmds?: string[] },
  ): Promise<void> {
    await this.commandService.sendDeviceCommand(deviceId, cmd, payloadType, payload, options);
  }

  public close(): void {
    this.connectionService.disconnect();
  }

  private handleRawMessage(raw: string): void {
    try {
      this.messages.emit({
        type: Lares4SocketEventType.RAW,
        message: raw,
      });
      const message = JSON.parse(raw) as Lares4Message;
      this.router.route(message);
    } catch (error: unknown) {
      this.messages.emit({
        type: Lares4SocketEventType.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

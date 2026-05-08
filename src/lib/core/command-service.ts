import WebSocket from 'ws';
import type { Lares4Command } from '../../types';
import { Lares4CommandFactory } from '../internal/lares4-command-factory';
import { Lares4Logger } from '../internal/lares4-logger';
import type { Lares4CoreState } from './state';
import { WsTransport } from './transport';
import { CommandDispatcher } from './command-dispatcher';
import { Lares4ConnectionError } from './errors';

interface SendCommandOptions {
  awaitResponse?: boolean;
  timeoutMs?: number;
  responseCmds?: string[];
}

export class CommandService {
  constructor(
    private readonly state: Lares4CoreState,
    private readonly commandFactory: Lares4CommandFactory,
    private readonly logger: Lares4Logger,
    private readonly dispatcher: CommandDispatcher,
    private readonly transport: WsTransport,
    private readonly commandTimeoutMs: number,
  ) {}

  get sender(): string {
    return this.commandFactory.sender;
  }

  public async sendLogin(): Promise<void> {
    const login = this.commandFactory.build_cmd('LOGIN', 'UNKNOWN', { PIN: 'true' });
    const raw = JSON.stringify(login);
    await this.transport.send(this.state.ws, raw);
  }

  public async requestInitialData(): Promise<void> {
    if (!this.state.idLogin) {
      throw new Lares4ConnectionError('ID_LOGIN not available');
    }
    await this.sendKseniaCommand('READ', 'CFG_THERMOSTATS', { ID_LOGIN: 'true', ID_READ: 'ALL', ID_ITEMS_RANGE: ['ALL', 'ALL'] });
    await this.sendKseniaCommand('READ', 'PRG_THERMOSTATS', { ID_LOGIN: 'true', ID_READ: 'ALL', ID_ITEMS_RANGE: ['ALL', 'ALL'] });
  }

  public async sendDeviceCommand(
    deviceId: string,
    cmd: string,
    payloadType: string,
    payload: Lares4Command['PAYLOAD'],
    options?: SendCommandOptions,
  ): Promise<void> {
    await this.dispatcher.enqueuePerDevice(deviceId, async () => {
      const resolvedPayload = this.resolvePayloadThermostatTarget(payloadType, payload);
      await this.sendKseniaCommand(cmd, payloadType, resolvedPayload, options);
    });
  }

  public async sendKseniaCommand(
    cmd: string,
    payloadType: string,
    payload: Lares4Command['PAYLOAD'],
    options: SendCommandOptions = {},
  ): Promise<void> {
    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      throw new Lares4ConnectionError('WebSocket not connected');
    }

    const command = this.commandFactory.build_cmd(cmd, payloadType, payload);
    const id = command.ID;
    const raw = JSON.stringify(command);

    let pending: Promise<void> | undefined;
    if (options.awaitResponse) {
      pending = this.dispatcher.registerPending(
        id,
        options.timeoutMs ?? this.commandTimeoutMs,
        options.responseCmds,
      );
    }

    try {
      await this.transport.send(this.state.ws, raw);
      if (pending) {
        await pending;
      }
    } catch (error: unknown) {
      this.dispatcher.clearPending(id);
      throw error;
    }
  }

  public replaceSessionLogin(idLogin: string): void {
    this.commandFactory.set_login_id = idLogin;
  }

  private resolvePayloadThermostatTarget(
    payloadType: string,
    payload: Lares4Command['PAYLOAD'],
  ): Lares4Command['PAYLOAD'] {
    if (payloadType !== 'CFG_ALL' || !Array.isArray(payload.CFG_THERMOSTATS) || payload.CFG_THERMOSTATS.length === 0) {
      return payload;
    }

    const first = payload.CFG_THERMOSTATS[0] as { ID?: string };
    const rawId = first?.ID;
    if (!rawId) {
      return payload;
    }

    const mappedId = this.state.thermostatProgramIdByOutputId.get(rawId)
      ?? this.state.thermostatCommandIdByOutputId.get(rawId)
      ?? rawId;

    this.state.thermostatCommandIdByOutputId.set(rawId, mappedId);
    if (mappedId === rawId) {
      return payload;
    }

    const cloned = { ...payload, CFG_THERMOSTATS: [...payload.CFG_THERMOSTATS] } as Lares4Command['PAYLOAD'];
    cloned.CFG_THERMOSTATS[0] = { ...(cloned.CFG_THERMOSTATS[0] as Record<string, unknown>), ID: mappedId };
    return cloned;
  }
}

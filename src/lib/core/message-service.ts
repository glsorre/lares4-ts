import type { Lares4Message, Lares4SocketEventEmitted } from '../../types';
import { Lares4SocketEventType } from '../../types';
import type { Lares4CoreState } from './state';
import { Lares4Logger } from '../internal/lares4-logger';
import type { CommandService } from './command-service';
import type { TypedEmitter } from './typed-emitter';

export class MessageService {
  constructor(
    private readonly state: Lares4CoreState,
    private readonly commandService: CommandService,
    private readonly logger: Lares4Logger,
    private readonly messages: TypedEmitter<Lares4SocketEventEmitted>,
    private readonly onLoginCompleted: () => void,
  ) {}

  public handleLoginResponse(message: Lares4Message): void {
    const result = message.PAYLOAD?.RESULT;
    if (result === 'OK') {
      const idLogin = String(message.PAYLOAD?.ID_LOGIN ?? '1');
      this.state.idLogin = idLogin;
      this.commandService.replaceSessionLogin(idLogin);
      this.state.pendingLogin?.resolve();
      this.messages.emit({ type: Lares4SocketEventType.OPEN });
      this.onLoginCompleted();
      this.commandService.requestInitialData().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error requesting initial data: ${message}`);
        this.messages.emit({ type: Lares4SocketEventType.ERROR, message });
      });
      return;
    }

    const reason = String(message.PAYLOAD?.RESULT_DETAIL ?? 'Unknown error');
    this.state.pendingLogin?.reject(new Error(`Login failed: ${reason}`));
    this.logger.error(`Login failed: ${reason}`);
  }

  public handleReadResponse(message: Lares4Message): void {
    if (message.PAYLOAD_TYPE === 'MULTI_TYPES') {
      this.messages.emit({
        type: Lares4SocketEventType.MULTI_TYPES,
        message: message.PAYLOAD,
      });
      return;
    }

    if (message.PAYLOAD_TYPE === 'CFG_THERMOSTATS' && Array.isArray(message.PAYLOAD.CFG_THERMOSTATS)) {
      for (const entry of message.PAYLOAD.CFG_THERMOSTATS) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const id = String((entry as Record<string, unknown>).ID ?? '');
        if (id) {
          this.state.thermostatCfgById.set(id, entry as Record<string, unknown>);
        }
      }
    }

    if (message.PAYLOAD_TYPE === 'PRG_THERMOSTATS' && Array.isArray(message.PAYLOAD.PRG_THERMOSTATS)) {
      this.state.thermostatProgramIdByOutputId.clear();
      this.state.domusSensorIdByThermostatProgramId.clear();
      for (const entry of message.PAYLOAD.PRG_THERMOSTATS as Array<Record<string, unknown>>) {
        const prgId = String(entry.ID ?? '');
        if (!prgId) {
          continue;
        }
        const periph = entry.PERIPH as { PID?: string } | undefined;
        if (periph?.PID) {
          this.state.domusSensorIdByThermostatProgramId.set(prgId, String(periph.PID));
        }
        for (const outputKey of ['HEATING_OUT', 'COOLING_OUT']) {
          const outputId = this.normalizeThermostatId(entry[outputKey]);
          if (outputId) {
            this.state.thermostatProgramIdByOutputId.set(outputId, prgId);
          }
        }
      }
    }

    if (message.PAYLOAD_TYPE.startsWith('STATUS_') || message.PAYLOAD_TYPE === 'ZONES') {
      this.messages.emit({
        type: Lares4SocketEventType.CHANGE,
        message: {
          [this.commandService.sender]: {
            [message.PAYLOAD_TYPE]: message.PAYLOAD[message.PAYLOAD_TYPE],
          },
        },
      });
    }
  }

  public handleRealtimeResponse(message: Lares4Message): void {
    this.messages.emit({
      type: Lares4SocketEventType.CHANGE,
      message: message.PAYLOAD,
    });
    if (!this.state.hasCompletedInitialSync) {
      this.state.hasCompletedInitialSync = true;
    }
  }

  public handleStatusUpdate(message: Lares4Message): void {
    this.messages.emit({
      type: Lares4SocketEventType.CHANGE,
      message: message.PAYLOAD,
    });
  }

  public handleCommandResponse(message: Lares4Message): void {
    this.messages.emit({
      type: Lares4SocketEventType.RESPONSE,
      message,
    });
  }

  private normalizeThermostatId(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized === 'NU' || normalized === 'NULL' || normalized === 'N/A') {
      return undefined;
    }
    return normalized;
  }
}

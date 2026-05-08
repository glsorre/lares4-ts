import { Lares4Logger } from '../internal/lares4-logger';
import { Lares4Command, Lares4SocketEventEmitted, Lares4SocketEventType, Lares4SocketOptions } from '../../types';
import { Lares4CoreClient } from '../core/client';

export class Lares4Socket {
  private _logger: Lares4Logger;
  private _client: Lares4CoreClient;
  public messages;

  constructor(
    sender: string,
    pin: string,
    ip: string,
    wss: boolean,
    logger: Lares4Logger,
    options: Lares4SocketOptions,
  ) {
    this._logger = logger;
    this._client = new Lares4CoreClient(sender, pin, ip, wss, logger, options);
    this.messages = this._client.messages;
  }

  get sender() {
    return this._client.sender;
  }

  public send(cmd: string, payload_type: string, payload: Lares4Command['PAYLOAD']): void {
    const payloadObj = payload as Record<string, unknown>;
    const output = payloadObj.OUTPUT as { ID?: string } | undefined;
    const scenario = payloadObj.SCENARIO as { ID?: string } | undefined;
    const thermostat = Array.isArray(payloadObj.CFG_THERMOSTATS)
      ? payloadObj.CFG_THERMOSTATS[0] as { ID?: string } | undefined
      : undefined;
    const deviceId = output?.ID
      ?? scenario?.ID
      ?? thermostat?.ID;
    const awaitWriteCfg = cmd === 'WRITE_CFG';

    const sendPromise = deviceId
      ? this._client.sendDeviceCommand(
        deviceId,
        cmd,
        payload_type,
        payloadObj,
        awaitWriteCfg ? { awaitResponse: true, responseCmds: ['WRITE_CFG_RES'] } : undefined,
      )
      : this._client.send(cmd, payload_type, payloadObj);

    void sendPromise.catch((error: unknown) => {
      this._logger.error(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
      this.messages.emit({
        type: Lares4SocketEventType.ERROR,
        message: error instanceof Error ? error.message : String(error),
      } as Lares4SocketEventEmitted);
    });
  }

  public async open() {
    await this._client.open();
  }

  public close() {
    this._client.close();
  }
}

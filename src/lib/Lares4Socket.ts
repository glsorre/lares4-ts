import WebSocket from 'ws';
import { Agent } from 'https';
import crypto from 'crypto';
import { Lares4Logger } from './Lares4Logger';
import { Lares4CommandFactory } from './Lares4CommandFactory';
import { Emitter } from '@mnasyrov/pubsub';
import { Lares4Command, Lares4SocketEventEmitted, Lares4SocketEventType, Lares4SocketOptions } from '../types';
import { Deferred } from '../utils';

export class Lares4Socket {
  private _ws: WebSocket;
  private _cmd_factory: Lares4CommandFactory;
  private _logger: Lares4Logger;

  private _is_connected: boolean = false;

  private _login_deferred: Deferred | null = null;

  private _heartbeat_interval: NodeJS.Timeout | null = null;
  private _heartbeat_interval_ms: number;
  private _reconnect_interval: NodeJS.Timeout | null = null;
  private _reconnect_delay_ms: number;

  public messages = new Emitter<Lares4SocketEventEmitted>();

  constructor(
    sender: string,
    pin: string,
    ip: string,
    wss: boolean,
    logger: Lares4Logger,
    options: Lares4SocketOptions,
  ) {
    this._ws = new WebSocket(`${ip}/KseniaWsock`, ['KS_WSOCK'], {
      protocol: wss ? 'wss' : 'ws',
      port: options.port ?? (wss ? 443 : 80),
      rejectUnauthorized: false,
      agent: new Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
        rejectUnauthorized: false,
        secureProtocol: 'TLS_method',
        ciphers: 'ALL:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
      }),
    });

    this._cmd_factory = new Lares4CommandFactory(sender, pin);
    this._logger = logger;
    this._heartbeat_interval_ms = options.heartbeat_interval_ms ?? 30000;
    this._reconnect_delay_ms = options.reconnect_delay_ms ?? 5000;

    this._login_deferred = new Deferred();
  }

  get sender() {
    return this._cmd_factory.get_sender;
  }

  private onOpen() {
    this._is_connected = true;
    if (this._reconnect_interval) {
      clearTimeout(this._reconnect_interval);
      this._reconnect_interval = null;
    }
    this.login();
  }

  private onMessage(data: WebSocket.Data) {
    const message = data.toString();
    const json = JSON.parse(message);
    if (json?.CMD === 'LOGIN') {
      if (json.PAYLOAD?.RESULT === 'OK') {
        this._login_deferred?.resolve(true);
        this.startHeartbeat();
        this._logger.debug('Login successful');
        this.messages.emit({
          type: Lares4SocketEventType.OPEN
        });
      } else {
        this._login_deferred?.resolve(false);
        this._logger.debug('Login failed');
      }
    } else if (json?.CMD === 'PING') {
      this._is_connected = true;
      this._logger.debug('PONG received from Lares4');
    } else if (json?.PAYLOAD_TYPE === 'CHANGES') {
      this.messages.emit({
        type: Lares4SocketEventType.CHANGE,
        message: json?.PAYLOAD
      });
    } else if (json?.PAYLOAD_TYPE === 'MULTI_TYPES') {
      this.messages.emit({
        type: Lares4SocketEventType.MULTI_TYPES,
        message: json?.PAYLOAD
      });
    }
  }

  private onClose() {
    this._is_connected = false;
    this.messages.emit({
      type: Lares4SocketEventType.CLOSE
    });
    this._logger.warn('WebSocket connection closed. Attempting to reconnect...');
    this.stopHeartbeat();
    this.reopen();
  }

  private onError(err: Error) {
    this._logger.error(`WebSocket error: ${err.message}`);
    this.messages.emit({
      type: Lares4SocketEventType.ERROR,
      message: err.message
    });
  }

  private async login() {
    const login_cmd = this._cmd_factory.build_cmd('LOGIN', 'UNKNOWN', { ID_LOGIN: 'true' });
    this._ws.send(JSON.stringify(login_cmd));
  }

  private heartbeat() {
    if (this._is_connected === false) {
      this._logger.warn('Heartbeat failed. Attempting to reconnect.');
      this.reopen();
      return;
    }
    this._is_connected = false;
    const ping_cmd = this._cmd_factory.build_cmd('PING', 'HEARTBEAT', { ID_LOGIN: 'true' });
    this._ws.send(JSON.stringify(ping_cmd));
  }

  public send(cmd: string, payload_type: string, payload: Lares4Command['PAYLOAD']): void {
    const command = this._cmd_factory.build_cmd(cmd, payload_type, payload);
    this._ws.send(JSON.stringify(command));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this._heartbeat_interval = setInterval(() => {
      this.heartbeat();
    }, this._heartbeat_interval_ms);
  }

  private stopHeartbeat() {
    if (this._heartbeat_interval) {
      clearInterval(this._heartbeat_interval);
      this._heartbeat_interval = null;
    }
  }

  public async open() {
    this._ws.on('open', this.onOpen.bind(this));
    this._ws.on('message', this.onMessage.bind(this));
    this._ws.on('close', this.onClose.bind(this));
    this._ws.on('error', this.onError.bind(this));
    await this._login_deferred.promise;
  }

  private async reopen() {
    if (this._reconnect_interval) return;
    this._reconnect_interval = setTimeout(async () => {
      this._logger.info('Attempting to reconnect...');
      await this.open();
    }, this._reconnect_delay_ms);
  }

  public close() {
    this.stopHeartbeat();
    if (this._reconnect_interval) {
      clearTimeout(this._reconnect_interval);
      this._reconnect_interval = null;
    }
    this._ws.removeAllListeners();
    this._ws.close();
  }
}
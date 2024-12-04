import {
  type Lares4Output,
  type Lares4Scenario,
  type Lares4BusPeripheral,
  type Lares4OutputStatus,
  type Lares4SystemStatus,
  type Lares4SensorStatus,
  type Lares4ThermostatConfiguration,
  type Lares4UpdateCommand,
  type Lares4Command,
  type Lares4ExportedOutput,
  type Lares4ExportedScenario,
  type Lares4EmittedOutputStatus,
  type Lares4ThermostatActModes,
  type Lares4ThermostatSeasons,
  type Lares4ExportedThermostat,
  type Lares4EmittedSensorStatus,
  Lares4UpdatePayloadKeys,
  Lares4TemperatureStatus,
  Lares4EmittedTemperatures
} from '../index';

import WebSocket from 'ws';
import { Emitter } from '@mnasyrov/pubsub';


import { Deferred } from './Deferred';
import { Lares4CommandFactory } from './CommandFactory';
import { Lares4Logger } from './Logger';

import * as log from '../log';

export class Lares4Factory {
  static async createLares4(sender: string, ip: string, pin: string, external_logger?: any) {
    const lares4 = new Lares4(sender, ip, pin, external_logger);
    await lares4.init();
    return lares4;
  }
}

interface Lares4Accessories {
  outputs?: Lares4Output[];
  perhiperals?: Lares4BusPeripheral[];
}

interface Lares4Status {
  outputs?: Lares4OutputStatus[];
  systems?: Lares4SystemStatus[];
  sensors?: Lares4SensorStatus[];
  temperatures?: Lares4TemperatureStatus[];
}

interface Lares4Configuration {
  thermostats?: Lares4ThermostatConfiguration[];
  scenarios?: Lares4Scenario[];
}

export class Lares4 {
  private _logger: Lares4Logger;
  private _cmd_fatory: Lares4CommandFactory;
  private _ws: WebSocket;

  private _accessories: Lares4Accessories = {};
  private _status: Lares4Status = {};
  private _configuration: Lares4Configuration = {};

  private _login_deferred: Deferred = new Deferred();

  public outputs_status_emitter = new Emitter<Lares4EmittedOutputStatus>();
  public sensors_status_emitter = new Emitter<Lares4EmittedSensorStatus>();
  public temperatures_status_emitter = new Emitter<Lares4EmittedTemperatures>();

  get initialized() {
    return this._accessories?.outputs &&
      this._accessories?.perhiperals &&
      this._status?.outputs &&
      this._status?.systems &&
      this._status?.sensors &&
      this._configuration?.thermostats &&
      this._configuration?.scenarios;
  }

  get accessories() {
    return this._accessories;
  }

  get status() {
    return this._status;
  }

  get configuration() {
    return this._configuration;
  }

  get logger() {
    return this._logger;
  }

  get lights(): Lares4ExportedOutput[] {
    return this._accessories.outputs
      ?.map((output, index) => ({
        id: index,
        details: output
      }))
      ?.filter((output, index) => 
        output.details.CAT === 'LIGHT' &&
        this.status?.outputs &&
        !this.status.outputs[index]?.POS
    ) ?? [];
  }

  get dimmers() : Lares4ExportedOutput[] {
    return this._accessories.outputs
      ?.map((output, index) => ({
        id: index,
        details: output
      }))
      ?.filter((output, index) => 
        output.details.CAT === 'LIGHT' &&
        this.status?.outputs &&
        this.status.outputs[index]?.POS
    ) ?? [];
  }

  get shutters(): Lares4ExportedOutput[] {
    return this._accessories.outputs
      ?.map((output, index) => ({
        id: index,
        details: output
      }))
      ?.filter(output => output.details.CAT === 'ROLL') ?? [];
  }

  get scenarios(): Lares4ExportedScenario[] {
    return this._configuration.scenarios
      ?.map((scenario, index) => ({
        id: index,
        details: scenario
      }))
      .filter(scenario => scenario.details.CAT !== 'ARM' && scenario.details.CAT !== 'DISARM') ?? [];
  }

  get thermostats(): Lares4ExportedThermostat[] {
    return this._status.sensors
      ?.filter(sensor => sensor.hasOwnProperty('DOMUS'))
      ?.map((sensor, index) => {
        const configuration = this._configuration.thermostats?.find(thermostat => thermostat.ID === sensor.ID);
        return {
          sensor: {
            id: index,
            details: sensor
          },
          configuration: {
            id: this._configuration.thermostats?.findIndex(thermostat => thermostat.ID === sensor.ID) ?? -1,
            details: configuration
          }
        }
      }) ?? [];
  }

  constructor(
    sender: string,
    ip: string,
    pin: string,
    external_logger?: any
  ) {
    this._cmd_fatory = new Lares4CommandFactory(sender, pin);
    this._logger = new Lares4Logger(external_logger);
    this._logger.log(`Connection to your Lares4 instance at ${ip}`); 
    this._ws = new WebSocket(`wss://${ip}/KseniaWsock`, ['KS_WSOCK'], {
      rejectUnauthorized: false,
      protocol: 'wss:'
    }); 
  }

  private getLogin(data: any) {
    data = JSON.parse(data);
    if (data.PAYLOAD?.RESULT === 'OK') {
      this._logger.log(`Logged in to Lares4 as ${data.PAYLOAD.DESCRIPTION}`); 
      this._login_deferred.resolve(data.PAYLOAD.ID_LOGIN);
    } else {
      this._logger.error(`Failed to login to Lares4`);
      this._login_deferred.reject();
    }
  }

  private getAccessories(deferred: Deferred, data:any) {
    if (data.PAYLOAD?.OUTPUTS && data.PAYLOAD?.BUS_HAS) {
      this._logger.log('Received outputs and perhiperals');
      deferred.resolve({
        outputs: data.PAYLOAD.OUTPUTS,
        perhiperals: data.PAYLOAD.BUS_HAS
      });
    } else {
      this._logger.error(`Failed to get outputs and perhiperals`);
      deferred.reject();
    }
  }

  private getStatus(deferred: Deferred, data: any) {
    if (data.PAYLOAD?.STATUS_OUTPUTS) {
      deferred.resolve({
        outputs: data.PAYLOAD.STATUS_OUTPUTS,
        systems: data.PAYLOAD.STATUS_SYSTEM,
        sensors: data.PAYLOAD.STATUS_BUS_HA_SENSORS,
        temperatures: data.PAYLOAD.STATUS_TEMPERATURES
      });
    } else {
      this._logger.error(`Failed to get system status`);
      deferred.reject();
    }
  }

  private getConfiguration(deferred: Deferred, data: any) {
    if (data.PAYLOAD?.CFG_THERMOSTATS && data.PAYLOAD?.SCENARIOS) {
      deferred.resolve({
        thermostats: data.PAYLOAD.CFG_THERMOSTATS,
        scenarios: data.PAYLOAD.SCENARIOS,
        outputs: data.PAYLOAD.PRG_OUTPUTS
      });
    } else {
      this._logger.error(`Failed to get thermostats configuration and scenarios`);
      deferred.reject();
    }
  }

  private getInitState(deferreds: Record<string, Deferred>, data: any) {
    data = JSON.parse(data);
    if (data.PAYLOAD?.OUTPUTS && data.PAYLOAD?.BUS_HAS) {
      this.getAccessories(deferreds.accessories, data);
    }
    if (data.PAYLOAD?.STATUS_OUTPUTS && data.PAYLOAD?.STATUS_SYSTEM && data.PAYLOAD?.STATUS_BUS_HA_SENSORS) {
      this.getStatus(deferreds.status, data);
    }
    if (data.PAYLOAD?.CFG_THERMOSTATS && data.PAYLOAD?.SCENARIOS) {
      this.getConfiguration(deferreds.configuration, data);
    }
  }

  public getOutputStatus(id: number) {
    return this._status.outputs?.find(output => Number(output.ID) === id);
  }

  public setOutput(id: number, value: string | number) {
    const set_output_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'CMD_USR',
      'CMD_SET_OUTPUT',{
        ID_LOGIN: true,
        PIN: true,
        OUTPUT: {
          ID: `${id}`,
          STA: `${value}`
        }
      }
    )
    this.send(set_output_cmd);
  }

  public triggerScenario(id: number) {
    const trigger_scenario_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'CMD_USR',
      'CMD_EXE_SCENARIO',
      {
        ID_LOGIN: true,
        PIN: true,
        SCENARIO: {
          ID: `${id}`
        }
      }
    )
    this.send(trigger_scenario_cmd);
  }

  public setThermostatMode(id: number, mode: Lares4ThermostatActModes) {
    const set_thermostat_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: true,
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            ACT_MODE: `${mode}`,
            MAN_HRS: '00'
          }
        ]
      }
    )
    this.send(set_thermostat_cmd);
  }

  public setThermostatManualEnding(id: number, time: string) {
    const set_thermostat_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: true,
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            MAN_HRS: time
          }
        ]
      }
    )
    this.send(set_thermostat_cmd);
  }

  public setThermostatSeason(id: number, season: Lares4ThermostatSeasons) {
    const set_thermostat_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: true,
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            ACT_SEA: `${season}`
          }
        ]
      }
    )
    this.send(set_thermostat_cmd);
  }

  public setThermostatTarget(id: number, season: Lares4ThermostatSeasons, target: number) {
    const set_thermostat_cmd: Lares4Command = this._cmd_fatory.build_cmd(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: true,
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            [season as string]: {
              TM: `${target}`
            }
          }
        ]
      }
    )
    this.send(set_thermostat_cmd);
  }

  private async requestConfiguration(deferred: Deferred) {
    const get_configuration_cmd = this._cmd_fatory.build_cmd(
      "READ",
      "MULTI_TYPES",
      {
        ID_LOGIN: true,
        ID_READ: "1",
        TYPES: ["CFG_THERMOSTATS", "SCENARIOS", "PRG_OUTPUTS"]
      }
    )

    this.send(get_configuration_cmd);
    return await deferred.promise;
  }

  private async requestStatus(deferred: Deferred) {
    const get_status_cmd = this._cmd_fatory.build_cmd(
      'REALTIME',
      'REGISTER',
      {
        ID_LOGIN: true,
        TYPES: ['STATUS_OUTPUTS', 'STATUS_SYSTEM', 'STATUS_BUS_HA_SENSORS', 'STATUS_TEMPERATURES']
      }
    )

    this.send(get_status_cmd);
    return await deferred.promise;
  }

  private async requestAccessories(deferred: Deferred) {
    const get_outputs_cmd = this._cmd_fatory.build_cmd(
      'READ',
      'MULTI_TYPES',
      {
        ID_LOGIN: true,
        ID_READ: '1',
        TYPES: ['OUTPUTS', 'BUS_HAS']
      }
    )

    this.send(get_outputs_cmd);
    return await deferred.promise;
  }

  private async requestLogin(): Promise<string> {
    const login_cmd = this._cmd_fatory.build_cmd(
      'LOGIN',
      'UNKNOWN',
      {
        PIN: true
      }
    )

    this.on('open', async () => {
      this._logger.log('Connected to Lares4');
      this.send(login_cmd);
    })

    return await this._login_deferred.promise;
  }

  public async init() {
    this.on('message', this.getLogin.bind(this));
    const login_id = await this.requestLogin();
    this._cmd_fatory.set_login_id = login_id;
    this.offAll('message');

    const init_deferreds = {
      accessories: new Deferred(),
      status: new Deferred(),
      configuration: new Deferred()
    } 
    this.on('message', this.getInitState.bind(this, init_deferreds));
    const [accessories, status, configuration] = await Promise.all([
      this.requestAccessories(init_deferreds.accessories),
      this.requestStatus(init_deferreds.status),
      this.requestConfiguration(init_deferreds.configuration)
    ]);
    this.offAll('message');

    this._accessories = accessories;
    this._status = status;
    this._configuration = configuration;

    this._logger.log(log.outputs(this, this._accessories.outputs));
    this._logger.log(log.sensorsStatus(this, this._status.sensors));
    this._logger.log(log.systemsStatus(this, this._status.systems));
    this._logger.log(log.thermostatsStatus(this,this._configuration.thermostats));
    this._logger.log(log.scenarios(this,this._configuration.scenarios));
    this._logger.log(log.thermostatsConfiguration(this, this._configuration.thermostats));
    
    this._logger.log('Initialization completed');
    
    this.on('message', this.update.bind(this));
    this._logger.log('Listening for updates...');
  }

  public on(event: string, callback: (data: any) => void) {
    this._logger.log(`Listening for ${event}`);
    this._ws.on(event, callback);
  }

  public off(event: string, callback: (data: any) => void) {
    this._logger.log(`Removing listener for ${event}`);
    this._ws.off(event, callback);
  }

  private update(data: string) {
    this._logger.log('Got update:');
    console.log(data);
    const updateData = JSON.parse(data) as Lares4UpdateCommand;
    if (updateData?.PAYLOAD_TYPE === 'CHANGES') {
      for (const receiver of Object.keys(updateData.PAYLOAD)) {
        if (receiver === this._cmd_fatory.get_sender) {
          for (const updates of Object.keys(updateData.PAYLOAD[receiver])) {
            switch (updates) {
              case 'STATUS_OUTPUTS':
                for (const update of updateData.PAYLOAD[receiver][updates]) {
                  this._status.outputs?.forEach((output, index) => {
                    if (output.ID === update.ID) {
                      if (this._status.outputs) this._status.outputs[index] = {
                        ...update
                      } as Lares4OutputStatus;
                      this.outputs_status_emitter.emit({
                        id: index,
                        status: update as Lares4OutputStatus
                      });
                      this._logger.log(log.outputStatus(this, Number(update.ID)));
                    }
                  });
                };
                break;
              case 'STATUS_SYSTEM':
                for (const update of updateData.PAYLOAD[receiver][updates]) {
                  this._status.systems?.forEach((status, index) => {
                    if (status.ID === update.ID) {
                      if (this._status.systems) this._status.systems[index] = {
                        ...update
                      } as Lares4SystemStatus;
                      this._logger.log(log.systemStatus(this, Number(update.ID)));
                    }
                  });
                }
                break;
              case 'STATUS_BUS_HA_SENSORS':
                for (const update of updateData.PAYLOAD[receiver][updates]) {
                  this._status.sensors?.forEach((sensor, index) => {
                    if (sensor.ID === update.ID) {
                      if (this._status.sensors) this._status.sensors[index] = {
                        ...update
                      } as Lares4SensorStatus;
                      this.sensors_status_emitter.emit({
                        id: index,
                        status: update as Lares4SensorStatus
                      });
                      this._logger.log(log.sensorStatus(this, Number(update.ID)));
                    }
                  });
                }
                break;
              case 'STATUS_TEMPERATURES':
                for (const update of updateData.PAYLOAD[receiver][updates]) {
                  this._status.temperatures?.forEach((temperature, index) => {
                    if (temperature.ID === update.ID) {
                      if (this._status.temperatures) this._status.temperatures[index] = {
                        ...update
                      } as Lares4TemperatureStatus;
                      this.temperatures_status_emitter.emit({
                        id: index,
                        status: update as Lares4TemperatureStatus
                      });
                      this._logger.log(log.temperatureStatus(this, Number(update.ID)));
                    }
                  });
                }
                break;
              default:
                break;
            }
          }
        }
      }
    }
  }

  public offAll(event: string) {
    this._logger.log(`Removing all listeners for ${event}`);
    this._ws.removeAllListeners(event)
  }

  public send(cmd: Lares4Command) {
    this._logger.log(`Sending command ${cmd.CMD} and payload type ${cmd.PAYLOAD_TYPE}`);
    this._ws.send(JSON.stringify(cmd));
  }

  public logout() {
    this._ws.close();
  }


}

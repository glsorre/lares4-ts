import {
  Lares4Message,
  Lares4SocketEventEmitted,
  Lares4SocketEventType,
  Lares4DeviceTypes,
  Lares4OutputCategories,
  Lares4Scenario,
  Lares4Zone,
  Lares4Sensor,
  Lares4Gate,
  Lares4Cover,
  Lares4Thermostat,
  Lares4Light,
  Output,
  OutputStatus,
  ZoneStatus,
  Zone,
  Scenario,
  BusPeripheral,
  StatusTemperatures,
  ThermostatConfiguration,
  Lares4Sensors,
  Lares4SensorTypes,
  Lares4Device,
  ThermostatSeasons,
  ThermostatActModes
} from '../types';

import { Deferred } from '../utils';
import { Lares4Socket } from './Lares4Socket';
import { GenericLogger, Lares4Logger, LogLevelEnum } from './Lares4Logger';

const SCENARIOS_NOT_ALLOWED = [
  'ARM',
  'DISARM',
];

const LARES4_INFO_KEYS = [
  'BUS_HAS',
  'CFG_THERMOSTATS',
  'OUTPUTS',
  'SCENARIOS',
  'ZONES',
  'STATUS_OUTPUTS',
  'STATUS_BUS_HA_SENSORS',
  'STATUS_TEMPERATURES',
  'STATUS_ZONES',
];

export interface Lares4Info {
  lights: Record<number, Lares4Light>;
  scenarios: Record<number, Lares4Scenario>;
  zones: Record<number, Lares4Zone>;
  sensors: Record<number, Lares4Sensors>;
  gates: Record<number, Lares4Gate>;
  covers: Record<number, Lares4Cover>;
  thermostats: Record<number, Lares4Thermostat>;
  last_updated: number;
}

export interface Lares4Options {
  port?: number;
  external_logger?: GenericLogger;
  heartbeat_interval_ms?: number;
  reconnect_delay_ms?: number;
  logLevel?: LogLevelEnum;
}

export class Lares4Factory {
  static async createLares4(sender: string, ip: string, pin: string, wss: boolean = true, options?: Lares4Options) {
    const lares4 = new Lares4(sender, ip, pin, wss, options);
    await lares4.run();
    return lares4;
  }
}

export class Lares4 {
  private _logger: Lares4Logger;
  private _ws: Lares4Socket;

  private _lares4: Lares4Info;

  private _deferreds: Map<string, Deferred> = new Map();

  get outputs(): Lares4Device[] {
    return [
      ...this.lights as Lares4Device[],
      ...this.covers as Lares4Device[],
      ...this.gates as Lares4Device[],
    ].sort((a, b) => a.id - b.id) ?? [];
  }

  get lights(): Lares4Light[] {
    return Object.values(
      this._lares4.lights
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  get covers(): Lares4Cover[] {
    return Object.values(
      this._lares4.covers
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  get gates(): Lares4Gate[] {
    return Object.values(
      this._lares4.gates
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  get scenarios(): Lares4Scenario[] {
    return Object.values(
      this._lares4.scenarios
    )
      .filter(scenario => !SCENARIOS_NOT_ALLOWED.includes(scenario.category))
      .sort((a, b) => a.id - b.id) ?? [];
  }

  get thermostats(): Lares4Thermostat[] {
    return Object.values(
      this._lares4.thermostats
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  get sensors(): Lares4Sensors[] {
    return Object.values(
      this._lares4.sensors
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  get zones(): Lares4Zone[] {
    return Object.values(
      this._lares4.zones
    ).sort((a, b) => a.id - b.id) ?? [];
  }

  constructor(
    sender: string,
    pin: string,
    ip: string,
    wss: boolean = true,
    options?: Lares4Options
  ) {
    this._logger = new Lares4Logger(options?.external_logger, options?.logLevel);
    this._ws = new Lares4Socket(
      sender,
      pin,
      ip,
      wss,
      this._logger,
      {
        port: options?.port ?? (wss ? 443 : 80),
        heartbeat_interval_ms: options?.heartbeat_interval_ms ?? 30000,
        reconnect_delay_ms: options?.reconnect_delay_ms ?? 5000,
      }
    );
  }

  public setOutput(id: number, value: string | number) {
    this._ws.send(
      'CMD_USR',
      'CMD_SET_OUTPUT', {
      ID_LOGIN: 'true',
      PIN: 'true',
      OUTPUT: {
        ID: `${id}`,
        STA: `${value}`,
      },
    },
    );
  }

  public triggerScenario(id: number) {
    this._ws.send(
      'CMD_USR',
      'CMD_EXE_SCENARIO',
      {
        ID_LOGIN: 'true',
        PIN: 'true',
        SCENARIO: {
          ID: `${id}`,
        },
      },
    );
  }

  public setThermostatMode(id: number, mode: ThermostatActModes) {
    this._ws.send(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: 'true',
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            ACT_MODE: `${mode}`,
            MAN_HRS: '00',
          },
        ],
      },
    );
  }

  public setThermostatManualEnding(id: number, time: string) {
    this._ws.send(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: 'true',
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            MAN_HRS: time,
          },
        ],
      },
    );
  }

  public setThermostatSeason(id: number, season: ThermostatSeasons) {
    this._ws.send(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: 'true',
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            ACT_SEA: `${season}`,
          },
        ],
      },
    );
  }

  public setThermostatTarget(id: number, season: ThermostatSeasons, target: number) {
    this._ws.send(
      'WRITE_CFG',
      'CFG_ALL',
      {
        ID_LOGIN: 'true',
        CFG_THERMOSTATS: [
          {
            ID: `${id}`,
            [season as string]: {
              TM: `${target}`,
            },
          },
        ],
      },
    );
  }

  private start() {
    LARES4_INFO_KEYS.forEach(type => {
      this._deferreds.set(type, new Deferred());
    });

    this._ws.send(
      'READ',
      'MULTI_TYPES',
      {
        ID_LOGIN: 'true',
        ID_READ: '1',
        TYPES: LARES4_INFO_KEYS
      },
    );
  }

  private update() {
    this._ws.send(
      'REALTIME',
      'REGISTER',
      {
        ID_LOGIN: 'true',
        TYPES: ['STATUS_OUTPUTS', 'STATUS_BUS_HA_SENSORS', 'STATUS_TEMPERATURES', 'STATUS_ZONES', 'SCENARIOS'],
      },
    );
  }

  public async run() {
    this._ws.messages.subscribe((message: Lares4SocketEventEmitted) => {
      this.listen(message);
    });

    await this._ws.open();
  }

  private listen(data: Lares4SocketEventEmitted) {
    switch (data.type) {
      case Lares4SocketEventType.OPEN:
        this.handleOpen();
        break;
      case Lares4SocketEventType.MULTI_TYPES:
        this.handleMultiTypes(data);
        break;
      case Lares4SocketEventType.CHANGE:
        this.handleChange(data);
        break;
      case Lares4SocketEventType.CLOSE:
        this.handleClose();
        break;
      case Lares4SocketEventType.ERROR:
        this.handleError(data);
        break;
    }
  }

  private async handleOpen() {
    this.start();
    await Promise.all(this._deferreds.values());
    this.update();
  }

  private handleClose() {
    this._deferreds.clear();
  }

  private handleError(data: Lares4SocketEventEmitted) {
    this._logger.error(`WebSocket error: ${data.message}`);
  }

  private handleMultiTypes(data: Lares4SocketEventEmitted) {
    const multiTypesData = JSON.parse(data.message) as Lares4Message;

    const lights: Record<number, Lares4Light> = {};
    const scenarios: Record<number, Lares4Scenario> = {};
    const zones: Record<number, Lares4Zone> = {};
    const sensors: Record<number, Lares4Sensors> = {};
    const gates: Record<number, Lares4Gate> = {};
    const covers: Record<number, Lares4Cover> = {};
    const thermostats: Record<number, Lares4Thermostat> = {};

    if (multiTypesData.PAYLOAD['OUTPUTS'] && multiTypesData.PAYLOAD['STATUS_OUTPUTS']) {

      multiTypesData.PAYLOAD['OUTPUTS'].forEach((output: Output) => {
        let type: Lares4DeviceTypes;
        const outputStatus = multiTypesData.PAYLOAD['STATUS_OUTPUTS']?.find((status: OutputStatus) => status.ID === output.ID);

        switch (output.CAT) {
          case Lares4OutputCategories.ROLL:
            type = Lares4DeviceTypes.COVER;
            covers[parseInt(output.ID)] = {
              id: parseInt(output.ID),
              type,
              description: output.DES,
              position: outputStatus.POS,
              targetPosition: outputStatus.TPOS,
              state: outputStatus.STA
            } as Lares4Cover;
            break;
          case Lares4OutputCategories.GATE:
            type = Lares4DeviceTypes.GATE;
            gates[parseInt(output.ID)] = {
              id: parseInt(output.ID),
              type,
              description: output.DES
            } as Lares4Gate;
            break;
          default:
            type = Lares4DeviceTypes.LIGHT;
            lights[parseInt(output.ID)] = {
              id: parseInt(output.ID),
              type,
              description: output.DES,
              brightness: outputStatus.POS,
              on: outputStatus.STA === 'ON' ? true : false,
              dimmable: outputStatus?.POS ? true : false,
            } as Lares4Light;
            break;
        }
      });

      this._lares4.lights = lights;
      this._lares4.covers = covers;
      this._lares4.gates = gates;
      this._deferreds.get('OUTPUTS')?.resolve(multiTypesData.PAYLOAD['OUTPUTS']);
      this._deferreds.get('STATUS_OUTPUTS')?.resolve(multiTypesData.PAYLOAD['STATUS_OUTPUTS']);
    } else {
      this._logger.warn(`No data found for types: OUTPUTS and STATUS_OUTPUTS`);
      this._deferreds.get('OUTPUTS')?.reject();
      this._deferreds.get('STATUS_OUTPUTS')?.reject();
    }

    if (multiTypesData.PAYLOAD['ZONES'] && multiTypesData.PAYLOAD['STATUS_ZONES']) {
      multiTypesData.PAYLOAD['ZONES'].forEach((zone: Zone) => {
        const zoneStatus = multiTypesData.PAYLOAD['STATUS_ZONES'].find((status: ZoneStatus) => status.ID === zone.ID);
        zones[parseInt(zone.ID)] = {
          id: parseInt(zone.ID),
          type: Lares4DeviceTypes.ZONE,
          armed: zoneStatus.A === 'Y',
          bypassed: zoneStatus.BYP === 'YES',
          fault: zoneStatus.FM === 'T',
          open: zoneStatus.STA === 'A',
        } as Lares4Zone;
      });

      this._lares4.zones = zones;
      this._deferreds.get('ZONES')?.resolve(multiTypesData.PAYLOAD['ZONES']);
    } else {
      this._logger.warn(`No data found for type: ${'ZONES'}`);
      this._lares4['ZONES'] = [];
    }

    if (multiTypesData.PAYLOAD['BUS_HAS']) {
      multiTypesData.PAYLOAD['BUS_HAS'].forEach((busPeripheral: BusPeripheral) => {
        sensors[parseInt(busPeripheral.ID)] = {
          id: parseInt(busPeripheral.ID),
          type: Lares4DeviceTypes.SENSOR,
          description: busPeripheral.DES,
          sensors: [
            {
              type: Lares4SensorTypes.TEMPERATURE,
              value: 0,
              unit: '°C'
            } as Lares4Sensor,
            {
              type: Lares4SensorTypes.HUMIDITY,
              value: 0,
              unit: '%'
            } as Lares4Sensor,
            {
              type: Lares4SensorTypes.LIGHT,
              value: 0,
              unit: 'lux'
            } as Lares4Sensor
          ]
        } as Lares4Sensors;
      });

      this._lares4.sensors = sensors;
      this._deferreds.get('BUS_HAS')?.resolve(multiTypesData.PAYLOAD['BUS_HAS']);
    } else {
      this._logger.warn(`No data found for type: ${'BUS_HAS'}`);
      this._lares4['BUS_HAS'] = [];
      this._deferreds.get('BUS_HAS')?.reject();
    }

    if (multiTypesData.PAYLOAD['STATUS_BUS_HA_SENSORS'] && multiTypesData.PAYLOAD['CFG_THERMOSTATS'] && multiTypesData.PAYLOAD['STATUS_THERMOSTATS']) {
      multiTypesData.PAYLOAD['STATUS_BUS_HA_SENSORS']
        .filter((sensor: BusPeripheral) => Object.hasOwn(sensor, 'DOMUS'))
        .forEach((sensor: BusPeripheral) => {
          const statusTemperatures = multiTypesData.PAYLOAD['STATUS_TEMPERATURES']?.findIndex((thermostat: StatusTemperatures) => thermostat.ID === sensor.ID);
          const configuration = multiTypesData.PAYLOAD['CFG_THERMOSTATS']?.find((thermostat: ThermostatConfiguration) => thermostat.ID === sensor.ID);

          thermostats[parseInt(sensor.ID)] = {
            id: parseInt(sensor.ID),
            type: Lares4DeviceTypes.THERMOSTAT,
            description: sensor.DES,
            currentTemperature: statusTemperatures?.TEMP,
            targetTemperature: configuration?.TM,
            mode: configuration?.ACT_MODE,
            season: configuration?.ACT_SEA,
            manualEnd: configuration?.MAN_HRS,
            enabled: statusTemperatures.THERM.OUT_STATUS === 'ON'
          } as Lares4Thermostat;
        });

      this._lares4.thermostats = thermostats;
      this._deferreds.get('STATUS_THERMOSTATS')?.resolve(multiTypesData.PAYLOAD['STATUS_THERMOSTATS']);
      this._deferreds.get('CFG_THERMOSTATS')?.resolve(multiTypesData.PAYLOAD['CFG_THERMOSTATS']);
      this._deferreds.get('STATUS_TEMPERATURES')?.resolve(multiTypesData.PAYLOAD['STATUS_TEMPERATURES']);
    } else {
      this._deferreds.get('STATUS_TEMPERATURES')?.reject();
      this._deferreds.get('CFG_THERMOSTATS')?.reject();
      this._deferreds.get('STATUS_THERMOSTATS')?.reject();
    }

    if (multiTypesData.PAYLOAD['SCENARIOS']) {
      multiTypesData.PAYLOAD['SCENARIOS'].forEach((scenario: Scenario) => {
        scenarios[parseInt(scenario.ID)] = {
          id: parseInt(scenario.ID),
          description: scenario.DES,
          type: Lares4DeviceTypes.SCENARIO,
          category: scenario.CAT,
        } as Lares4Scenario;
      });

      this._lares4.scenarios = scenarios;
      this._deferreds.get('SCENARIOS')?.resolve(multiTypesData.PAYLOAD['SCENARIOS']);
    } else {
      this._logger.warn(`No data found for type: ${'SCENARIOS'}`);
      this._lares4['SCENARIOS'] = [];
      this._deferreds.get('SCENARIOS')?.reject();
    }
  }

  private handleChange(data: Lares4SocketEventEmitted) {
    const changeData = JSON.parse(data.message) as Lares4Message;
    for (const receiver of Object.keys(changeData.PAYLOAD)) {
      if (receiver === this._ws.sender) {
        for (const updates of Object.keys(changeData.PAYLOAD[receiver])) {
          switch (updates) {
            case 'STATUS_OUTPUTS':
              for (const update of changeData.PAYLOAD[receiver][updates]) {
                const device = this.outputs.find((output) => output.id === parseInt(update.ID));
                switch (device.type) {
                  case Lares4DeviceTypes.COVER:
                    this._lares4.covers[device.id] = {
                      ...this._lares4.covers[device.id],
                      position: update.POS,
                      open: update.STA === 'open' ? true : false,
                    } as Lares4Cover;
                    break;
                  case Lares4DeviceTypes.GATE:
                    this._lares4.gates[device.id] = {
                      ...this._lares4.gates[device.id],
                    } as Lares4Gate;
                    break;
                  default:
                    this._lares4.lights[device.id] = {
                      ...this._lares4.lights[device.id],
                      brightness: update.POS,
                      on: update.STA === 'on' ? true : false,
                      dimmable: update?.POS ? true : false,
                    } as Lares4Light;
                    break;
                }
              }
              break;
            case 'STATUS_BUS_HA_SENSORS':
              for (const update of changeData.PAYLOAD[receiver][updates]) {
                const device = this.sensors.find((sensor) => sensor.id === parseInt(update.ID));
                if (device) {
                  this._lares4.sensors[device.id] = {
                    ...this._lares4.sensors[device.id],
                    sensors: [
                      {
                        type: Lares4SensorTypes.TEMPERATURE,
                        value: update.TEMP,
                        unit: '°C',
                      },
                      {
                        type: Lares4SensorTypes.HUMIDITY,
                        value: update.HUMIDITY,
                        unit: '%',
                      },
                      {
                        type: Lares4SensorTypes.LIGHT,
                        value: update.LIGHT,
                        unit: 'lux',
                      },
                    ],
                  } as Lares4Sensors;
                }
              }
              break;
            case 'STATUS_TEMPERATURES':
              for (const update of changeData.PAYLOAD[receiver][updates]) {
                const device = this.thermostats.find((thermostat) => thermostat.id === parseInt(update.ID));
                if (device) {
                  this._lares4.thermostats[device.id] = {
                    ...this._lares4.thermostats[device.id],
                    currentTemperature: update.TEMP,
                    mode: update.THERM.ACT_MODEL,
                    season: update.THERM.ACT_SEA,
                    enabled: update.THERM.OUT_STATUS === 'ON'
                  } as Lares4Thermostat;
                }
              }
              break;
            case 'STATUS_ZONES':
              for (const update of changeData.PAYLOAD[receiver][updates]) {
                const zone = this.zones.find((zone) => zone.id === parseInt(update.ID));
                if (zone) {
                  this._lares4.zones[zone.id] = {
                    ...zone,
                    armed: update.A === 'Y',
                    bypassed: update.BYP === 'YES',
                    fault: update.FM === 'T',
                    open: update.STA === 'A',
                  } as Lares4Zone;
                }
              }
              break;
            default:
              break;
          }
        }
      }
    }
  }

  public switchOn(id: number) {
    this.setOutput(id, 'ON');
  }

  public switchOff(id: number) {
    this.setOutput(id, 'OFF');
  }

  public dimmerTo(id: number, level: number) {
    this.setOutput(id, level);
  }

  public rollUp(id: number) {
    this.setOutput(id, 'UP');
  }

  public rollDown(id: number) {
    this.setOutput(id, 'DOWN');
  }

  public rollStop(id: number) {
    this.setOutput(id, 'STOP');
  }

  public setThermostatManualTimeout(
    id: number,
    timeout_time: string,
  ) {
    this.setThermostatManualEnding(id, timeout_time);
  }


  public rollTo(
    id: number,
    target_position: number,
  ): void {
    this.setOutput(id, target_position);
  }

}

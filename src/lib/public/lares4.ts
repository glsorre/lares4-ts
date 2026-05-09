import {
  Lares4Message,
  Lares4SocketEventEmitted,
  Lares4SocketEventType,
  Lares4DeviceTypes,
  Lares4Scenario,
  Lares4Zone,
  Lares4Sensor,
  Lares4Gate,
  Lares4Switch,
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
  StatusSystem,
  ThermostatConfiguration,
  Lares4Sensors,
  Lares4SensorTypes,
  Lares4Device,
  ThermostatSeasons,
  ThermostatActModes,
  Lares4DeviceUpdateEvent,
  mapActMode,
  mapSeason,
  mapCoverState,
  Lares4DeviceDiscoveredEvent,
  Lares4SystemStatusSnapshot,
  Lares4SystemStatusEvent,
} from '../../types';

import { Deferred } from '../../utils';
import { Lares4Socket } from './lares4-socket';
import { GenericLogger, Lares4Logger, LogLevelEnum } from '../internal/lares4-logger';
import { TypedEmitter } from '../core/typed-emitter';
import { projectOutputDevice } from '../core/device-projector';
import { parseFloatInRange, parseIntegerInRange } from '../core/parse';

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
  'STATUS_SYSTEM',
];

export interface Lares4Info {
  lights: Record<number, Lares4Light>;
  scenarios: Record<number, Lares4Scenario>;
  zones: Record<number, Lares4Zone>;
  sensors: Record<number, Lares4Sensors>;
  gates: Record<number, Lares4Gate>;
  switches: Record<number, Lares4Switch>;
  covers: Record<number, Lares4Cover>;
  thermostats: Record<number, Lares4Thermostat>;
  systemStatus: Lares4SystemStatusSnapshot;
}

export interface Lares4Options {
  port?: number;
  external_logger?: GenericLogger;
  heartbeat_interval_ms?: number;
  reconnect_delay_ms?: number;
  log_level?: LogLevelEnum;
  command_timeout_ms?: number;
  /** Called for every `MULTI_TYPES` read with the parsed payload (e.g. for debugging protocol vs derived state). */
  onMultitypesPayload?: (payload: Record<string, unknown>) => void;
  /** Called when a device is first discovered during initial sync. */
  onDeviceDiscovered?: (event: Lares4DeviceDiscoveredEvent) => void;
  /** Called once initial sync completes and realtime registration is active. */
  onInitialSyncComplete?: () => void;
  /** Called when system status snapshot changes (`STATUS_SYSTEM`). */
  onSystemStatus?: (event: Lares4SystemStatusEvent) => void;
}

export class Lares4Factory {
  static async createLares4(sender: string, ip: string, pin: string, wss: boolean = true, options?: Lares4Options) {
    const lares4 = new Lares4(sender, pin, ip, wss, options);
    await lares4.run();
    return lares4;
  }
}

export class Lares4 {
  private _logger: Lares4Logger;
  private _ws: Lares4Socket;

  private _lares4: Lares4Info;

  private _deferreds: Map<string, Deferred> = new Map();
  private readonly _updateEmitter = new TypedEmitter<Lares4DeviceUpdateEvent>();
  private _unsubscribeMessages?: () => void;
  /** Resolved when the first OPEN handler finishes initial MULTI_TYPES sync (after REALTIME REGISTER). */
  private _initialSync: Deferred<void> | undefined;
  private readonly _onMultitypesPayload?: (payload: Record<string, unknown>) => void;
  private readonly _onDeviceDiscovered?: (event: Lares4DeviceDiscoveredEvent) => void;
  private readonly _onInitialSyncComplete?: () => void;
  private readonly _onSystemStatus?: (event: Lares4SystemStatusEvent) => void;
  private readonly _discoveredEmitter = new TypedEmitter<Lares4DeviceDiscoveredEvent>();
  private readonly _initialSyncCompleteEmitter = new TypedEmitter<void>();
  private readonly _systemStatusEmitter = new TypedEmitter<Lares4SystemStatusEvent>();
  private readonly _seenDeviceKeys = new Set<string>();
  private readonly _pendingOutputStatuses = new Map<number, OutputStatus>();
  private readonly _pendingSensorStatuses = new Map<number, { ID: string; TEMP: number; HUMIDITY: number; LIGHT: number }>();
  private readonly _pendingTemperatureStatuses = new Map<number, StatusTemperatures>();
  private readonly _pendingZoneStatuses = new Map<number, ZoneStatus>();

  public onUpdate(listener: (event: Lares4DeviceUpdateEvent) => void): () => void {
    return this._updateEmitter.subscribe(listener);
  }

  public onDiscovered(listener: (event: Lares4DeviceDiscoveredEvent) => void): () => void {
    return this._discoveredEmitter.subscribe(listener);
  }

  public onInitialSyncComplete(listener: () => void): () => void {
    return this._initialSyncCompleteEmitter.subscribe(() => listener());
  }

  public onSystemStatus(listener: (event: Lares4SystemStatusEvent) => void): () => void {
    return this._systemStatusEmitter.subscribe(listener);
  }

  get outputs(): Lares4Device[] {
    return [
      ...this.lights as Lares4Device[],
      ...this.covers as Lares4Device[],
      ...this.gates as Lares4Device[],
      ...this.switches as Lares4Device[],
    ].sort((a, b) => a.id - b.id);
  }

  get lights(): Lares4Light[] {
    return Object.values(
      this._lares4.lights,
    ).sort((a, b) => a.id - b.id);
  }

  get covers(): Lares4Cover[] {
    return Object.values(
      this._lares4.covers,
    ).sort((a, b) => a.id - b.id);
  }

  get gates(): Lares4Gate[] {
    return Object.values(
      this._lares4.gates,
    ).sort((a, b) => a.id - b.id);
  }

  get switches(): Lares4Switch[] {
    return Object.values(
      this._lares4.switches,
    ).sort((a, b) => a.id - b.id);
  }

  get scenarios(): Lares4Scenario[] {
    return Object.values(
      this._lares4.scenarios,
    )
      .filter(scenario => !SCENARIOS_NOT_ALLOWED.includes(scenario.category))
      .sort((a, b) => a.id - b.id);
  }

  get thermostats(): Lares4Thermostat[] {
    return Object.values(
      this._lares4.thermostats,
    ).sort((a, b) => a.id - b.id);
  }

  get sensors(): Lares4Sensors[] {
    return Object.values(
      this._lares4.sensors,
    ).sort((a, b) => a.id - b.id);
  }

  get zones(): Lares4Zone[] {
    return Object.values(
      this._lares4.zones,
    ).sort((a, b) => a.id - b.id);
  }

  get systemStatus(): Lares4SystemStatusSnapshot {
    return this._lares4.systemStatus;
  }

  constructor(
    sender: string,
    pin: string,
    ip: string,
    wss: boolean = true,
    options?: Lares4Options,
  ) {
    this._logger = new Lares4Logger(options?.external_logger, options?.log_level);
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
        command_timeout_ms: options?.command_timeout_ms,
      },
    );
    this._onMultitypesPayload = options?.onMultitypesPayload;
    this._onDeviceDiscovered = options?.onDeviceDiscovered;
    this._onInitialSyncComplete = options?.onInitialSyncComplete;
    this._onSystemStatus = options?.onSystemStatus;
    this._lares4 = {
      lights: {},
      scenarios: {},
      zones: {},
      sensors: {},
      gates: {},
      switches: {},
      covers: {},
      thermostats: {},
      systemStatus: { temperatures: [] },
    };
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
        TYPES: LARES4_INFO_KEYS,
      },
    );
  }

  private update() {
    this._ws.send(
      'REALTIME',
      'REGISTER',
      {
        ID_LOGIN: 'true',
        TYPES: ['STATUS_OUTPUTS', 'STATUS_BUS_HA_SENSORS', 'STATUS_TEMPERATURES', 'STATUS_ZONES', 'SCENARIOS', 'STATUS_SYSTEM'],
      },
    );
  }

  public async run() {
    this._initialSync = new Deferred<void>();
    this._seenDeviceKeys.clear();
    this._unsubscribeMessages?.();
    this._unsubscribeMessages = this._ws.messages.subscribe((message: Lares4SocketEventEmitted) => {
      this.listen(message);
    });

    await this._ws.open();
    await this._initialSync.promise;
  }

  private listen(data: Lares4SocketEventEmitted) {
    switch (data.type) {
    case Lares4SocketEventType.OPEN:
      void this.handleOpen();
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
    try {
      this.start();
      const results = await Promise.allSettled([...this._deferreds.values()].map(d => d.promise));
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) {
        this._logger.warn(`Initial sync: ${failCount} data type(s) unavailable`);
      }
      this.update();
      this._onInitialSyncComplete?.();
      this._initialSyncCompleteEmitter.emit(undefined);
      this._initialSync?.resolve();
    } catch (err) {
      this._initialSync?.reject(err instanceof Error ? err : new Error(String(err)));
      this._logger.error(`handleOpen failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleClose() {
    this._deferreds.clear();
    this._seenDeviceKeys.clear();
    this._pendingOutputStatuses.clear();
    this._pendingSensorStatuses.clear();
    this._pendingTemperatureStatuses.clear();
    this._pendingZoneStatuses.clear();
    this._initialSync?.reject(new Error('Connection closed before initial sync completed'));
  }

  private handleError(data: Lares4SocketEventEmitted) {
    this._logger.error(`WebSocket error: ${data.message}`);
  }

  private handleMultiTypes(data: Lares4SocketEventEmitted) {
    const multiTypesData = this.parseEventPayload(data);
    const payload = multiTypesData.PAYLOAD as Record<string, unknown>;
    this._onMultitypesPayload?.(payload);
    const outputs = payload.OUTPUTS as Output[] | undefined;
    const statusOutputs = payload.STATUS_OUTPUTS as OutputStatus[] | undefined;
    const zonesPayload = payload.ZONES as Zone[] | undefined;
    const statusZones = payload.STATUS_ZONES as ZoneStatus[] | undefined;
    const busHas = payload.BUS_HAS as BusPeripheral[] | undefined;
    const statusBusSensors = payload.STATUS_BUS_HA_SENSORS as BusPeripheral[] | undefined;
    const statusTemperatures = payload.STATUS_TEMPERATURES as StatusTemperatures[] | undefined;
    const statusSystem = payload.STATUS_SYSTEM as StatusSystem[] | undefined;
    const cfgThermostats = payload.CFG_THERMOSTATS as ThermostatConfiguration[] | undefined;
    const scenariosPayload = payload.SCENARIOS as Scenario[] | undefined;

    const lights: Record<number, Lares4Light> = {};
    const scenarios: Record<number, Lares4Scenario> = {};
    const zones: Record<number, Lares4Zone> = {};
    const sensors: Record<number, Lares4Sensors> = {};
    const gates: Record<number, Lares4Gate> = {};
    const switches: Record<number, Lares4Switch> = {};
    const covers: Record<number, Lares4Cover> = {};
    const thermostats: Record<number, Lares4Thermostat> = {};

    if (outputs && statusOutputs) {
      for (const output of outputs as Output[]) {
        const outputStatus = statusOutputs.find((status: OutputStatus) => status.ID === output.ID);

        if (!outputStatus) {
          this._logger.warn(`No StatusOutputs entry for output ${output.ID}, skipping`);
          continue;
        }

        const projected = projectOutputDevice(output, outputStatus);
        if (!projected) {
          continue;
        }

        switch (projected.type) {
        case Lares4DeviceTypes.COVER:
          covers[projected.id] = projected;
          this.emitDiscoveredIfFirst(projected);
          break;
        case Lares4DeviceTypes.GATE:
          gates[projected.id] = projected;
          this.emitDiscoveredIfFirst(projected);
          break;
        case Lares4DeviceTypes.SWITCH:
          switches[projected.id] = projected;
          this.emitDiscoveredIfFirst(projected);
          break;
        case Lares4DeviceTypes.LIGHT:
          lights[projected.id] = projected;
          this.emitDiscoveredIfFirst(projected);
          break;
        default:
          break;
        }
      }

      this._lares4.lights = lights;
      this._lares4.covers = covers;
      this._lares4.gates = gates;
      this._lares4.switches = switches;
      Object.keys(this._lares4.lights).forEach((id) => this.applyPendingOutputStatus(Number(id)));
      Object.keys(this._lares4.covers).forEach((id) => this.applyPendingOutputStatus(Number(id)));
      Object.keys(this._lares4.gates).forEach((id) => this.applyPendingOutputStatus(Number(id)));
      Object.keys(this._lares4.switches).forEach((id) => this.applyPendingOutputStatus(Number(id)));
      this._deferreds.get('OUTPUTS')?.resolve(outputs);
      this._deferreds.get('STATUS_OUTPUTS')?.resolve(statusOutputs);
    } else {
      this._logger.warn('No data found for types: OUTPUTS and STATUS_OUTPUTS');
      this._deferreds.get('OUTPUTS')?.reject(new Error('OUTPUTS missing'));
      this._deferreds.get('STATUS_OUTPUTS')?.reject(new Error('STATUS_OUTPUTS missing'));
    }

    if (zonesPayload && statusZones) {
      for (const zone of zonesPayload as Zone[]) {
        const zoneStatus = statusZones.find((status: ZoneStatus) => status.ID === zone.ID);

        if (!zoneStatus) {
          this._logger.warn(`No StatusZones entry for zone ${zone.ID}, skipping`);
          continue;
        }

        zones[parseInt(zone.ID)] = {
          id: parseInt(zone.ID),
          type: Lares4DeviceTypes.ZONE,
          description: zone.DES ?? '',
          armed: zoneStatus.A === 'Y',
          bypassed: zoneStatus.BYP === 'YES',
          fault: zoneStatus.FM === 'T',
          open: zoneStatus.STA === 'A',
        } as Lares4Zone;
        this.emitDiscoveredIfFirst(zones[parseInt(zone.ID)]);
      }

      this._lares4.zones = zones;
      Object.keys(this._lares4.zones).forEach((id) => this.applyPendingZoneStatus(Number(id)));
      this._deferreds.get('ZONES')?.resolve(zonesPayload);
      this._deferreds.get('STATUS_ZONES')?.resolve(statusZones);
    } else {
      this._logger.warn(`No data found for type: ${'ZONES'}`);
      this._lares4.zones = {};
      this._deferreds.get('ZONES')?.reject(new Error('ZONES missing'));
      this._deferreds.get('STATUS_ZONES')?.reject(new Error('STATUS_ZONES missing'));
    }

    if (busHas) {
      busHas.forEach((busPeripheral: BusPeripheral) => {
        sensors[parseInt(busPeripheral.ID)] = {
          id: parseInt(busPeripheral.ID),
          type: Lares4DeviceTypes.SENSOR,
          description: busPeripheral.DES,
          sensors: [
            {
              type: Lares4SensorTypes.TEMPERATURE,
              value: 0,
              unit: '°C',
            } as Lares4Sensor,
            {
              type: Lares4SensorTypes.HUMIDITY,
              value: 0,
              unit: '%',
            } as Lares4Sensor,
            {
              type: Lares4SensorTypes.LIGHT,
              value: 0,
              unit: 'lux',
            } as Lares4Sensor,
          ],
        } as Lares4Sensors;
        this.emitDiscoveredIfFirst(sensors[parseInt(busPeripheral.ID)]);
      });

      this._lares4.sensors = sensors;
      Object.keys(this._lares4.sensors).forEach((id) => this.applyPendingSensorStatus(Number(id)));
      this._deferreds.get('BUS_HAS')?.resolve(busHas);
    } else {
      this._logger.warn(`No data found for type: ${'BUS_HAS'}`);
      this._lares4.sensors = {};
      this._deferreds.get('BUS_HAS')?.reject(new Error('BUS_HAS missing'));
    }

    if (statusBusSensors && cfgThermostats && statusTemperatures) {
      statusBusSensors
        .filter((sensor: BusPeripheral) => Object.hasOwn(sensor, 'DOMUS'))
        .forEach((sensor: BusPeripheral) => {
          const statusTemperature = statusTemperatures.find((thermostat: StatusTemperatures) => thermostat.ID === sensor.ID);
          const configuration = cfgThermostats.find((thermostat: ThermostatConfiguration) => thermostat.ID === sensor.ID);
          const busHasRow = busHas?.find((row: BusPeripheral) => row.ID === sensor.ID);

          if (!statusTemperature) {
            this._logger.warn(`No StatusTemperatures entry for thermostat ${sensor.ID}, skipping`);
            return;
          }

          thermostats[parseInt(sensor.ID)] = {
            id: parseInt(sensor.ID),
            type: Lares4DeviceTypes.THERMOSTAT,
            description: sensor.DES || busHasRow?.DES || sensors[parseInt(sensor.ID)]?.description || '',
            currentTemperature: parseFloatInRange(statusTemperature.TEMP, -50, 100) ?? 0,
            targetTemperature: parseFloatInRange((configuration?.WIN as { TM?: string } | undefined)?.TM, 0, 50) ?? 0,
            mode: mapActMode(configuration?.ACT_MODE ?? ThermostatActModes.OFF),
            season: mapSeason(configuration?.ACT_SEA ?? ThermostatSeasons.WIN),
            manualEnd: parseIntegerInRange(configuration?.MAN_HRS, 0, 9999) ?? 0,
            enabled: statusTemperature.THERM?.OUT_STATUS === 'ON',
          } as Lares4Thermostat;
          this.emitDiscoveredIfFirst(thermostats[parseInt(sensor.ID)]);
        });

      this._lares4.thermostats = thermostats;
      Object.keys(this._lares4.thermostats).forEach((id) => this.applyPendingTemperatureStatus(Number(id)));
      this._deferreds.get('STATUS_BUS_HA_SENSORS')?.resolve(statusBusSensors);
      this._deferreds.get('CFG_THERMOSTATS')?.resolve(cfgThermostats);
      this._deferreds.get('STATUS_TEMPERATURES')?.resolve(statusTemperatures);
    } else {
      this._deferreds.get('STATUS_BUS_HA_SENSORS')?.reject(new Error('STATUS_BUS_HA_SENSORS missing'));
      this._deferreds.get('STATUS_TEMPERATURES')?.reject(new Error('STATUS_TEMPERATURES missing'));
      this._deferreds.get('CFG_THERMOSTATS')?.reject(new Error('CFG_THERMOSTATS missing'));
    }

    if (scenariosPayload) {
      scenariosPayload.forEach((scenario: Scenario) => {
        scenarios[parseInt(scenario.ID)] = {
          id: parseInt(scenario.ID),
          description: scenario.DES,
          type: Lares4DeviceTypes.SCENARIO,
          category: scenario.CAT,
        } as Lares4Scenario;
        this.emitDiscoveredIfFirst(scenarios[parseInt(scenario.ID)]);
      });

      this._lares4.scenarios = scenarios;
      this._deferreds.get('SCENARIOS')?.resolve(scenariosPayload);
    } else {
      this._logger.warn(`No data found for type: ${'SCENARIOS'}`);
      this._lares4.scenarios = {};
      this._deferreds.get('SCENARIOS')?.reject(new Error('SCENARIOS missing'));
    }

    if (Array.isArray(statusSystem)) {
      this.applySystemStatus(statusSystem);
      this._deferreds.get('STATUS_SYSTEM')?.resolve(statusSystem);
    } else {
      this._deferreds.get('STATUS_SYSTEM')?.reject(new Error('STATUS_SYSTEM missing'));
    }
  }

  private handleChange(data: Lares4SocketEventEmitted) {
    const changeData = this.parseEventPayload(data);
    for (const receiver of Object.keys(changeData.PAYLOAD ?? {})) {
      if (receiver === this._ws.sender) {
        for (const updates of Object.keys(changeData.PAYLOAD[receiver])) {
          switch (updates) {
          case 'STATUS_OUTPUTS':
            for (const update of changeData.PAYLOAD[receiver][updates] as OutputStatus[]) {
              const outputId = parseInt(update.ID, 10);
              const device = this.outputs.find((output) => output.id === outputId);
              if (!device) {
                this._pendingOutputStatuses.set(outputId, update);
                continue;
              }
              switch (device.type) {
              case Lares4DeviceTypes.COVER:
                this._lares4.covers[device.id] = {
                  ...this._lares4.covers[device.id],
                  position: parseIntegerInRange(update.POS, 0, 100) ?? 0,
                  targetPosition: parseIntegerInRange(update.TPOS ?? update.POS, 0, 100) ?? 0,
                  state: mapCoverState(update.STA),
                } as Lares4Cover;
                this._updateEmitter.emit({ type: Lares4DeviceTypes.COVER, device: this._lares4.covers[device.id] });
                break;
              case Lares4DeviceTypes.GATE:
                this._lares4.gates[device.id] = {
                  ...this._lares4.gates[device.id],
                  on: update.STA?.toUpperCase() === 'ON',
                } as Lares4Gate;
                this._updateEmitter.emit({ type: Lares4DeviceTypes.GATE, device: this._lares4.gates[device.id] });
                break;
              case Lares4DeviceTypes.SWITCH:
                this._lares4.switches[device.id] = {
                  ...this._lares4.switches[device.id],
                  on: update.STA?.toUpperCase() === 'ON',
                } as Lares4Switch;
                this._updateEmitter.emit({ type: Lares4DeviceTypes.SWITCH, device: this._lares4.switches[device.id] });
                break;
              default:
                this._lares4.lights[device.id] = {
                  ...this._lares4.lights[device.id],
                  brightness: parseIntegerInRange(update.POS, 0, 100) ?? 0,
                  on: update.STA?.toUpperCase() === 'ON',
                  dimmable: update.POS !== undefined,
                } as Lares4Light;
                this._updateEmitter.emit({ type: Lares4DeviceTypes.LIGHT, device: this._lares4.lights[device.id] });
                break;
              }
            }
            break;
          case 'STATUS_BUS_HA_SENSORS':
            for (const update of changeData.PAYLOAD[receiver][updates] as Array<{ ID: string; TEMP: number; HUMIDITY: number; LIGHT: number }>) {
              const device = this.sensors.find((sensor) => sensor.id === parseInt(update.ID));
              if (!device) {
                this._pendingSensorStatuses.set(parseInt(update.ID, 10), update);
                continue;
              }
              this._lares4.sensors[device.id] = {
                ...this._lares4.sensors[device.id],
                sensors: [
                  {
                    type: Lares4SensorTypes.TEMPERATURE,
                    value: parseFloatInRange(update.TEMP, -50, 100) ?? 0,
                    unit: '°C',
                  },
                  {
                    type: Lares4SensorTypes.HUMIDITY,
                    value: parseFloatInRange(update.HUMIDITY, 0, 100) ?? 0,
                    unit: '%',
                  },
                  {
                    type: Lares4SensorTypes.LIGHT,
                    value: parseFloatInRange(update.LIGHT, 0, 100000) ?? 0,
                    unit: 'lux',
                  },
                ],
              } as Lares4Sensors;
              this._updateEmitter.emit({ type: Lares4DeviceTypes.SENSOR, device: this._lares4.sensors[device.id] });
            }
            break;
          case 'STATUS_TEMPERATURES':
            for (const update of changeData.PAYLOAD[receiver][updates] as StatusTemperatures[]) {
              const device = this.thermostats.find((thermostat) => thermostat.id === parseInt(update.ID));
              if (!device) {
                this._pendingTemperatureStatuses.set(parseInt(update.ID, 10), update);
                continue;
              }
              this._lares4.thermostats[device.id] = {
                ...this._lares4.thermostats[device.id],
                currentTemperature: parseFloatInRange(update.TEMP, -50, 100) ?? this._lares4.thermostats[device.id].currentTemperature,
                mode: mapActMode(update.THERM?.ACT_MODEL ?? ThermostatActModes.OFF),
                season: mapSeason(update.THERM?.ACT_SEA ?? ThermostatSeasons.WIN),
                enabled: update.THERM?.OUT_STATUS === 'ON',
              } as Lares4Thermostat;
              this._updateEmitter.emit({ type: Lares4DeviceTypes.THERMOSTAT, device: this._lares4.thermostats[device.id] });
            }
            break;
          case 'STATUS_ZONES':
            for (const update of changeData.PAYLOAD[receiver][updates] as ZoneStatus[]) {
              const zone = this.zones.find((zone) => zone.id === parseInt(update.ID));
              if (!zone) {
                this._pendingZoneStatuses.set(parseInt(update.ID, 10), update);
                continue;
              }
              this._lares4.zones[zone.id] = {
                ...zone,
                armed: update.A === 'Y',
                bypassed: update.BYP === 'YES',
                fault: update.FM === 'T',
                open: update.STA === 'A',
              } as Lares4Zone;
              this._updateEmitter.emit({ type: Lares4DeviceTypes.ZONE, device: this._lares4.zones[zone.id] });
            }
            break;
          case 'STATUS_SYSTEM':
            this.applySystemStatus(changeData.PAYLOAD[receiver][updates] as StatusSystem[]);
            break;
          case 'SCENARIOS':
            for (const update of changeData.PAYLOAD[receiver][updates] as Scenario[]) {
              const id = parseInt(update.ID);
              if (this._lares4.scenarios[id]) {
                this._lares4.scenarios[id] = {
                  ...this._lares4.scenarios[id],
                  description: update.DES ?? this._lares4.scenarios[id].description,
                  category: update.CAT ?? this._lares4.scenarios[id].category,
                };
                this._updateEmitter.emit({ type: Lares4DeviceTypes.SCENARIO, device: this._lares4.scenarios[id] });
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

  private parseEventPayload(data: Lares4SocketEventEmitted): Lares4Message {
    if (!data.message) {
      return { SENDER: '', RECEIVER: '', CMD: '', ID: '', PAYLOAD_TYPE: '', PAYLOAD: {}, TIMESTAMP: '', CRC_16: '' };
    }

    if (typeof data.message === 'string') {
      try {
        return JSON.parse(data.message) as Lares4Message;
      } catch {
        this._logger.error(`Failed to parse event payload: ${data.message}`);
        return { SENDER: '', RECEIVER: '', CMD: '', ID: '', PAYLOAD_TYPE: '', PAYLOAD: {}, TIMESTAMP: '', CRC_16: '' };
      }
    }

    return {
      SENDER: '',
      RECEIVER: '',
      CMD: '',
      ID: '',
      PAYLOAD_TYPE: '',
      PAYLOAD: data.message as Record<string, unknown>,
      TIMESTAMP: '',
      CRC_16: '',
    };
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

  public rollTo(
    id: number,
    target_position: number,
  ): void {
    this.setOutput(id, target_position);
  }

  public close(): void {
    this._unsubscribeMessages?.();
    this._ws.close();
  }

  private applySystemStatus(rows: StatusSystem[]): void {
    const row = rows[0];
    if (!row?.TEMP) {
      return;
    }
    const temperatures = [
      row.TEMP.IN !== undefined
        ? { id: 'in' as const, value: parseFloatInRange(row.TEMP.IN, -50, 100) ?? 0, unit: '°C' as const }
        : undefined,
      row.TEMP.OUT !== undefined
        ? { id: 'out' as const, value: parseFloatInRange(row.TEMP.OUT, -50, 100) ?? 0, unit: '°C' as const }
        : undefined,
    ].filter(Boolean) as Lares4SystemStatusSnapshot['temperatures'];
    this._lares4.systemStatus = { temperatures };
    const event: Lares4SystemStatusEvent = { status: this._lares4.systemStatus };
    this._onSystemStatus?.(event);
    this._systemStatusEmitter.emit(event);
  }

  private applyPendingOutputStatus(id: number): void {
    const pending = this._pendingOutputStatuses.get(id);
    if (!pending) {
      return;
    }
    this._pendingOutputStatuses.delete(id);
    this.handleChange({
      type: Lares4SocketEventType.CHANGE,
      message: { [this._ws.sender]: { STATUS_OUTPUTS: [pending] } },
    });
  }

  private applyPendingSensorStatus(id: number): void {
    const pending = this._pendingSensorStatuses.get(id);
    if (!pending) {
      return;
    }
    this._pendingSensorStatuses.delete(id);
    this.handleChange({
      type: Lares4SocketEventType.CHANGE,
      message: { [this._ws.sender]: { STATUS_BUS_HA_SENSORS: [pending] } },
    });
  }

  private applyPendingTemperatureStatus(id: number): void {
    const pending = this._pendingTemperatureStatuses.get(id);
    if (!pending) {
      return;
    }
    this._pendingTemperatureStatuses.delete(id);
    this.handleChange({
      type: Lares4SocketEventType.CHANGE,
      message: { [this._ws.sender]: { STATUS_TEMPERATURES: [pending] } },
    });
  }

  private applyPendingZoneStatus(id: number): void {
    const pending = this._pendingZoneStatuses.get(id);
    if (!pending) {
      return;
    }
    this._pendingZoneStatuses.delete(id);
    this.handleChange({
      type: Lares4SocketEventType.CHANGE,
      message: { [this._ws.sender]: { STATUS_ZONES: [pending] } },
    });
  }

  private emitDiscoveredIfFirst(device: Lares4Device): void {
    const key = `${device.type}:${device.id}`;
    if (this._seenDeviceKeys.has(key)) {
      return;
    }
    this._seenDeviceKeys.add(key);
    const event: Lares4DeviceDiscoveredEvent = { device };
    this._onDeviceDiscovered?.(event);
    this._discoveredEmitter.emit(event);
  }

}

export interface Lares4Command {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  TIMESTAMP: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: Record<string, unknown>;
  CRC_16: string;
}

export interface Lares4ErrorLike {
  name: string;
  code?: string;
  message: string;
}

export enum Lares4DeviceTypes {
  LIGHT = 'light',
  THERMOSTAT = 'thermostat',
  SENSOR = 'sensor',
  COVER = 'cover',
  ZONE = 'zone',
  SCENARIO = 'scenario',
  GATE = 'gate',
  /** On/off auxiliary output (siren, boiler, twilight relay, etc.) when the panel uses a generic light CAT. */
  SWITCH = 'switch',
}

export enum Lares4SensorTypes {
  TEMPERATURE = 'temperature',
  HUMIDITY = 'humidity',
  LIGHT = 'light',
}

export interface Lares4SystemTemperature {
  id: 'in' | 'out';
  value: number;
  unit: '°C';
}

export interface Lares4SystemStatusSnapshot {
  temperatures: Lares4SystemTemperature[];
}

export enum Lares4CoverStates {
  OPENING = 'opening',
  CLOSING = 'closing',
  STOPPED = 'stopped',
}

export function mapCoverState(raw: string): Lares4CoverStates {
  return (Object.values(Lares4CoverStates) as string[]).includes(raw)
    ? (raw as Lares4CoverStates)
    : Lares4CoverStates.STOPPED;
}

export interface Lares4Device {
  id: number;
  type: Lares4DeviceTypes;
  name?: string;
  description: string;
}

export interface Lares4Light extends Lares4Device {
  type: Lares4DeviceTypes.LIGHT;
  brightness: number;
  on: boolean;
  dimmable: boolean;
}

export interface Lares4Cover extends Lares4Device {
  type: Lares4DeviceTypes.COVER;
  position: number;
  targetPosition?: number;
  state: Lares4CoverStates;
}

export interface Lares4Thermostat extends Lares4Device {
  type: Lares4DeviceTypes.THERMOSTAT;
  currentTemperature?: number;
  targetTemperature?: number;
  mode: Lares4ThermostatActModes;
  season: Lares4ThermostatSeasons;
  manualEnd: number;
  enabled: boolean;
}

export enum Lares4ThermostatActModes {
  off = 'OFF',
  manual = 'MAN',
  manual_timer = 'MAN_TMR',
  weekly = 'WEEKLY',
  special1 = 'SD1',
  special2 = 'SD2'
}

export enum Lares4ThermostatSeasons {
  winter = 'WIN',
  summer = 'SUM'
}

export function mapActMode(raw: string): Lares4ThermostatActModes {
  return (Object.values(Lares4ThermostatActModes) as string[]).includes(raw)
    ? (raw as Lares4ThermostatActModes)
    : Lares4ThermostatActModes.off;
}

export function mapSeason(raw: string): Lares4ThermostatSeasons {
  return (Object.values(Lares4ThermostatSeasons) as string[]).includes(raw)
    ? (raw as Lares4ThermostatSeasons)
    : Lares4ThermostatSeasons.winter;
}

export interface Lares4Sensors extends Lares4Device {
  type: Lares4DeviceTypes.SENSOR;
  sensors: Lares4Sensor[];
}

export interface Lares4Sensor {
  type: Lares4SensorTypes;
  value: number;
  unit?: string;
}

export interface Lares4Zone extends Lares4Device {
  type: Lares4DeviceTypes.ZONE;
  armed: boolean;
  bypassed: boolean;
  fault: boolean;
  open: boolean;
}

export interface Lares4Scenario extends Lares4Device {
  type: Lares4DeviceTypes.SCENARIO;
  category: string;
}

export interface Lares4Gate extends Lares4Device {
  type: Lares4DeviceTypes.GATE;
  on: boolean;
}

export interface Lares4Switch extends Lares4Device {
  type: Lares4DeviceTypes.SWITCH;
  on: boolean;
}

export enum Lares4OutputCategories {
  LIGHT = 'light',
  ROLL = 'roll',
  GATE = 'gate',
}

export enum LogLevelEnum {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
}

export interface GenericLogger {
  info: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  debug: (message: string) => void;
}

export type Lares4LoggerLike = GenericLogger;

export interface Lares4SocketLike {
  readonly readyState: number;
  send(data: string, cb?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  addEventListener?(event: string, handler: (event: unknown) => void): void;
  removeEventListener?(event: string, handler: (event: unknown) => void): void;
  ping?(): void;
  terminate?(): void;
}

export type Lares4WsFactory = (
  url: string,
  protocols: string[],
  options?: Record<string, unknown>
) => Lares4SocketLike;

// Internal protocol/data-transfer models. Keep these out of root exports.

export interface Output {
  ID: string;
  DES: string;
  CNV: string;
  CAT: Lares4OutputCategories;
  MOD: string;
}

export interface OutputStatus {
  ID: string;
  STA: string;
  POS?: string;
  TPOS?: string;
}

export interface Scenario {
  ID: string;
  DES: string;
  PIN: string;
  CAT: string;
}

export interface Zone {
  ID: string;
  DES: string;
  TYPE: string;
  STATUS: string;
  ENABLED: string;
}

export interface ZoneStatus {
  ID: string;
  STA: string;
  BYP: string;
  A: string;
  FM: string;
}

export interface BusPeripheral {
  ID: string;
  DES: string;
  TYP: string;
  STA: string;
  BUS: SensorLinkStatus;
  DOMUS?: StatusDomus;
}

export interface StatusDomus {
  TEM: string;
  HUM: string;
  LHT: string;
  PIR: string;
  TL: string;
  TH: string;
}

export interface StatusTemperatures {
  ID: string,
  TEMP: string,
  THERM: {
    ACT_SEA: ThermostatSeasons,
    ACT_MODEL: ThermostatActModes,
    ACT_TOF: string,
    TEMP_THR: {
      T: string,
      VAL: string
    },
    OUT_STATUS: string
  }
}

export interface StatusSystem {
  ID: string;
  ARM?: {
    D?: string;
    S?: string;
  };
  ALARM?: unknown[];
  ALARM_MEM?: unknown[];
  TAMPER?: unknown[];
  TAMPER_MEM?: unknown[];
  FAULT?: unknown[];
  FAULT_MEM?: unknown[];
  TEMP?: {
    IN?: string;
    OUT?: string;
  };
  [key: string]: unknown;
}

export interface RawStatusOutputsPayload {
  STATUS_OUTPUTS: OutputStatus[];
}

export interface RawStatusZonesPayload {
  STATUS_ZONES: ZoneStatus[];
}

export interface RawStatusBusSensorsPayload {
  STATUS_BUS_HA_SENSORS: Array<{ ID: string; TEMP: number; HUMIDITY: number; LIGHT: number }>;
}

export interface RawStatusTemperaturesPayload {
  STATUS_TEMPERATURES: StatusTemperatures[];
}

export interface RawStatusSystemPayload {
  STATUS_SYSTEM: StatusSystem[];
}

export interface ProgramThermostat {
  ID: string;
  DES?: string;
  PERIPH?: {
    PID?: string;
    TYP?: string;
  };
  HEATING_OUT?: string;
  COOLING_OUT?: string;
  [key: string]: unknown;
}

export interface SystemStatus {
  ID: string;
  TEMP?: {
    IN?: string;
    OUT?: string;
  };
  [key: string]: unknown;
}

export interface SensorLinkStatus {
  SN: string;
  BUS: string;
}

export interface ThermostatDayConfiguration {
  T: string;
  S: string;
}

export interface ThermostatSeasonConfiguration {
  T1: string;
  T2: string;
  T3: string;
  TM: string;
  MON: ThermostatDayConfiguration[];
  TUE: ThermostatDayConfiguration[];
  WED: ThermostatDayConfiguration[];
  THU: ThermostatDayConfiguration[];
  FRI: ThermostatDayConfiguration[];
  SAT: ThermostatDayConfiguration[];
  SUN: ThermostatDayConfiguration[];
  SD1: ThermostatDayConfiguration[];
  SD2: ThermostatDayConfiguration[];
}

export interface ThermostatConfiguration {
  ID: string;
  ACT_MODE: ThermostatActModes;
  ACT_SEA: ThermostatSeasons;
  MAN_HRS: string;
  WIN: ThermostatSeasonConfiguration;
  SUM: ThermostatSeasonConfiguration;
}

export enum ThermostatActModes {
  OFF = 'OFF',
  MANUAL = 'MAN',
  MANUAL_TIMER = 'MAN_TMR',
  WEEKLY = 'WEEKLY',
  SPECIAL1 = 'SD1',
  SPECIAL2 = 'SD2'
}

export enum ThermostatSeasons {
  WIN = 'WIN',
  SUM = 'SUM'
}

// Internal socket event contract used by transport/client internals.

export interface Lares4MessagePayload {
  RESULT: string;
  [key: string]: unknown;
}

export interface Lares4Message {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: Record<string, unknown>;
  TIMESTAMP: string;
  CRC_16: string;
}

export interface Lares4SocketOptions {
  port?: number;
  heartbeat_interval_ms?: number;
  reconnect_delay_ms?: number;
  login_timeout_ms?: number;
  command_timeout_ms?: number;
  wsFactory?: Lares4WsFactory;
  wsOptions?: Record<string, unknown>;
}

export enum Lares4SocketEventType{
  OPEN = 'open',
  MULTI_TYPES = 'multi_types',
  CHANGE = 'change',
  RESPONSE = 'response',
  RAW = 'raw',
  SENT = 'sent',
  CLOSE = 'close',
  ERROR = 'error',
}

export interface Lares4SocketEventEmitted {
  type: Lares4SocketEventType;
  message?: string | Record<string, unknown> | Lares4Message;
}

export interface Lares4SentEvent {
  raw: string;
  command: Lares4Command;
}

export type Lares4DeviceUpdateEvent =
  | { type: Lares4DeviceTypes.LIGHT; device: Lares4Light }
  | { type: Lares4DeviceTypes.COVER; device: Lares4Cover }
  | { type: Lares4DeviceTypes.GATE; device: Lares4Gate }
  | { type: Lares4DeviceTypes.SWITCH; device: Lares4Switch }
  | { type: Lares4DeviceTypes.SENSOR; device: Lares4Sensors }
  | { type: Lares4DeviceTypes.THERMOSTAT; device: Lares4Thermostat }
  | { type: Lares4DeviceTypes.ZONE; device: Lares4Zone }
  | { type: Lares4DeviceTypes.SCENARIO; device: Lares4Scenario };

export interface Lares4DeviceDiscoveredEvent {
  device: Lares4Device;
}

export interface Lares4SystemStatusEvent {
  status: Lares4SystemStatusSnapshot;
}

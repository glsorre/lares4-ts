export interface Lares4Command {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  TIMESTAMP: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: any;
  CRC_16: string;
}

export enum Lares4DeviceTypes {
  LIGHT = 'light',
  THERMOSTAT = 'thermostat',
  SENSOR = 'sensor',
  COVER = 'cover',
  ZONE = 'zone',
  SCENARIO = 'scenario',
  GATE = 'gate',
}

export enum Lares4SensorTypes {
  TEMPERATURE = 'temperature',
  HUMIDITY = 'humidity',
  LIGHT = 'light',
}

export enum Lares4CoverStates {
  OPENING = 'opening',
  CLOSING = 'closing',
  STOPPED = 'stopped',
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

export enum Lares4OutputCategories {
  LIGHT = 'light',
  ROLL = 'roll',
  GATE = 'gate',
}

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

export interface Lares4MessagePayload {
  RESULT: string;
  PAYLOAD: any
}

export interface Lares4Message {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: Lares4MessagePayload;
}

export interface Lares4SocketOptions {
  port?: number;
  heartbeat_interval_ms?: number;
  reconnect_delay_ms?: number;
}

export enum Lares4SocketEventType{
  OPEN = 'open',
  MULTI_TYPES = 'multi_types',
  CHANGE = 'change',
  CLOSE = 'close',
  ERROR = 'error',
}

export interface Lares4SocketEventEmitted {
  type: Lares4SocketEventType;
  message?: string;
}
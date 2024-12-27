export type Lares4Payload = {
  [key: string]: object | Array<unknown> | string | number;
}

export type Lares4Command = {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  TIMESTAMP: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: Lares4Payload;
  CRC_16: string;
}

export type Lares4Output = {
  ID: string;
  DES: string;
  CNV: string;
  CAT: string;
  MOD: string;
}

export type Lares4Scenario = {
  ID: string;
  DES: string;
  PIN: string;
  CAT: string;
}

export type Lares4BusPeripheral = {
  ID: string;
  DES: string;
  TYP: string;
}

export type Lares4OutputStatus = {
  ID: string;
  STA: string;
  POS?: string;
  TPOS?: string;
}

export type Lares4TemperatureStatus = {
  ID: string,
  TEMP: string,
  THERM: {
    ACT_SEA: Lares4ThermostatSeasons,
    ACT_MODEL: Lares4ThermostatActModes,
    ACT_TOF: string,
    TEMP_THR: {
      T: string,
      VAL: string
    },
    OUT_STATUS: string
  }
}

export type Lares4AlarmStatus = {
  D: string;
  S: string;
}

export type Lares4TempStatus = {
  IN: string;
  OUT: string;
}

export type Lares4TimeStatus = {
  GMT: string;
  TZ: string;
  TZM: string;
  DAWN: string;
  DUSK: string;
}

export type Lares4SystemStatus = {
  ID: string;
  INFO: Array<unknown>;
  TAMPER: Array<unknown>;
  TAMPER_MEM: Array<unknown>;
  ALARM: Array<unknown>;
  ALARM_MEM: Array<unknown>;
  FAULT: Array<unknown>;
  FAULT_MEM: Array<unknown>;
  ARM: Lares4AlarmStatus;
  TEMP: Lares4TempStatus;
  TIME: Lares4TimeStatus;
}

export type Lares4DomusStatus = {
  TEM: string;
  HUM: string;
  LHT: string;
  PIR: string;
  TL: string;
  TH: string;
}

export type Lares4SensorLinkStatus = {
  TYPE: string;
  SN: string;
  BUS: string;
}

export type Lares4SensorStatus = {
  ID: string;
  TYP: string;
  STA: string;
  BUS: Lares4SensorLinkStatus;
  DOMUS?: Lares4DomusStatus;
}

export type Lares4ThermostatDayConfiguration = {
  T: string;
  S: string;
}

export type Lares4ThermostatSeasonConfiguration = {
  T1: string;
  T2: string;
  T3: string;
  TM: string;
  MON: Lares4ThermostatDayConfiguration[];
  TUE: Lares4ThermostatDayConfiguration[];
  WED: Lares4ThermostatDayConfiguration[];
  THU: Lares4ThermostatDayConfiguration[];
  FRI: Lares4ThermostatDayConfiguration[];
  SAT: Lares4ThermostatDayConfiguration[];
  SUN: Lares4ThermostatDayConfiguration[];
  SD1: Lares4ThermostatDayConfiguration[];
  SD2: Lares4ThermostatDayConfiguration[];
}

export type Lares4ThermostatConfiguration = {
  ID: string;
  ACT_MODE: Lares4ThermostatActModes;
  ACT_SEA: Lares4ThermostatSeasons;
  MAN_HRS: string;
  WIN: Lares4ThermostatSeasonConfiguration;
  SUM: Lares4ThermostatSeasonConfiguration;
}

export enum Lares4UpdatePayloadKeys {
  OUTPUTS = 'STATUS_OUTPUTS',
  SYSTEM = 'STATUS_SYSTEM',
  PERHIPERALS = 'STATUS_BUS_HA_SENSORS',
  TEMPERATURES = 'STATUS_TEMPERATURES'
}

export enum Lares4ThermostatActModes {
  OFF = 'OFF',
  MANUAL = 'MAN',
  MANUAL_TIMER = 'MAN_TMR',
  WEEKLY = 'WEEKLY',
  SPECIAL_1 = 'SD1',
  SPECIAL_2 = 'SD2'
}

export enum Lares4ThermostatSeasons {
  WINTER = 'WIN',
  SUMMER = 'SUM'
}

export type Lares4UpdatePayloadContent = {
  [key in Lares4UpdatePayloadKeys]: Lares4OutputStatus[] | Lares4SystemStatus[] | Lares4SensorStatus[];
}

export type Lares4UpdatePayload = {
  RESULT: string;
  PAYLOAD: Lares4UpdatePayloadContent;
}

export type Lares4UpdateCommand = {
  SENDER: string;
  RECEIVER: string;
  CMD: string;
  ID: string;
  PAYLOAD_TYPE: string;
  PAYLOAD: Lares4UpdatePayload;
}

export type Lares4ExportedOutput = {
  id: number;
  details: Lares4Output;
}

export type Lares4ExportedScenario = {
  id: number;
  details: Lares4Scenario;
}

export type Lares4EmittedTemperatures = {
  id: number;
  status: Lares4TemperatureStatus;
}

export type Lares4EmittedOutputStatus = {
  id: number;
  status: Lares4OutputStatus;
}

export type Lares4EmittedSensorStatus = {
  id: number;
  status: Lares4SensorStatus;
}

export type Lares4ExportedThermostat = {
  sensor: {
    id: number;
    details: Lares4SensorStatus;
  },
  temperature: {
    id: number;
    details: Lares4TemperatureStatus;
  }
  configuration: {
    id: number;
    details: Lares4ThermostatConfiguration;
  }
}

export {
  debounceWithLock,
  switchOn,
  switchOff,
  dimmerTo,
  rollUp,
  rollDown,
  rollStop,
  rollTo,
  triggerScenario,
  setThermostatMode,
  setThermostatManualTimeout,
  setThermostatSeason,
  setThermostatTarget,
} from './actions';

export {
  outputStatus,
  outputs,
  systemStatus,
  systemsStatus,
  sensorStatus,
  sensorsStatus,
  thermostatStatus,
  thermostatsStatus,
  thermostatConfiguration,
  thermostatsConfiguration,
  scenario,
  scenarios,
} from './log';

import { Lares4Factory, Lares4 } from './lib/Lares4';

export {
  Lares4Factory,
  Lares4,
};

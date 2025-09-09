import winston from 'winston';
import { Lares4Cover, Lares4Device, Lares4Gate, Lares4Light, Lares4Scenario, Lares4Sensor, Lares4SensorTypes, Lares4Thermostat, Lares4ThermostatActModes, Lares4Zone } from '../types';

export enum LogLevelEnum {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
}

export interface GenericLogger {
  info: (message: string) => (void | winston.LogMethod);
  error: (message: string) => (void | winston.LogMethod);
  warn: (message: string) => (void | winston.LogMethod);
  debug: (message: string) => (void | winston.LogMethod);
}

export class Lares4Logger {
  private _logger: GenericLogger;
  private _level: string;

  public get get_level(): string {
    return this._level;
  }

  public set set_level(level: string) {
    this._level = level;
  }

  constructor(externalLogger?: GenericLogger, level: LogLevelEnum = LogLevelEnum.INFO) {
    if (externalLogger) {
      this._logger = externalLogger as unknown as GenericLogger;
    } else {
      this._logger = winston.createLogger({
        level: this._level,
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
            ),
          }),
        ],
      }) as unknown as GenericLogger;
    }
  }

  public info(message: string): void {
    this._logger.info(message);
  }

  public error(message: string): void {
    this._logger.error(message);
  }

  public warn(message: string): void {
    this._logger.warn(message);
  }

  public debug(message: string): void {
    this._logger.debug(message);
  }

  public device(device: Lares4Device): void {
    this._logger.debug(`Device ${device.id} (${device.type}): ${device.description}`);
  }

  public light(light: Lares4Light): void {
    if (light.dimmable) {
      this._logger.debug(`Light ${light.name} - ${light.description} is ${light.on ? 'ON' : 'OFF'} at ${light.brightness}%`);
    } else {
      this._logger.debug(`Light ${light.name} - ${light.description} is ${light.on ? 'ON' : 'OFF'}`);
    }
  }

  public cover(cover: Lares4Cover): void {
    if (cover.position < 100) {
      this._logger.debug(`Cover ${cover.id} (${cover.type}): ${cover.description} is OPEN at ${cover.position}%`);
    } else {
      this._logger.debug(`Cover ${cover.id} (${cover.type}): ${cover.description} is CLOSED`);
    }
  }

  public zone(zone: Lares4Zone): void {
    if (zone.bypassed) {
      this._logger.debug(`Zone ${zone.id} (${zone.type}): ${zone.description} is BYPASSED`);
    } else {
      this._logger.debug(`Zone ${zone.id} (${zone.type}): ${zone.description} is NOT BYPASSED`);
    }
  }

  public sensor(name: string, sensor: Lares4Sensor): void {
    if (sensor.type === Lares4SensorTypes.TEMPERATURE) {
      this._logger.debug(`Temperature ${name} reports ${sensor.value} ${sensor.unit}`);
    }
    if (sensor.type === Lares4SensorTypes.HUMIDITY) {
      this._logger.debug(`Humidity ${name} reports ${sensor.value} ${sensor.unit}`);
    }
    if (sensor.type === Lares4SensorTypes.LIGHT) {
      this._logger.debug(`Light ${name} reports ${sensor.value} ${sensor.unit}`);
    }
  }

  public gate(gate: Lares4Gate): void {
    this._logger.debug(`Gate ${gate.name} - ${gate.description} is ${gate.on ? 'ACTIVE' : 'INACTIVE'}`);
  }

  public scenario(scenario: Lares4Scenario): void {
    this._logger.debug(`Scenario ${scenario.name} - ${scenario.description}`);
  }

  public thermostatMode(thermostat: Lares4Thermostat): void {
    if (thermostat.mode === Lares4ThermostatActModes.manual) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is set to reach ${thermostat.targetTemperature}°C`);
    }

    if (thermostat.mode !== Lares4ThermostatActModes.manual_timer) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is set to reach ${thermostat.targetTemperature}°C till ${thermostat.manualEnd}`);
    }

    if (thermostat.mode === Lares4ThermostatActModes.weekly) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is set to reach ${thermostat.targetTemperature}°C following ksenia weekly plan`);
    }

    if (thermostat.mode === Lares4ThermostatActModes.special1) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is set to reach ${thermostat.targetTemperature}°C following ksenia special1 day plan`);
    }

    if (thermostat.mode === Lares4ThermostatActModes.special2) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is set to reach ${thermostat.targetTemperature}°C following ksenia special2 day plan`);
    }
  }

  public thermostatState(thermostat: Lares4Thermostat): void {
    if (thermostat.enabled) {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is enabled`);
    } else {
      this._logger.debug(`Thermostat ${thermostat.name} - ${thermostat.description} is disabled`);
    }
  }
}
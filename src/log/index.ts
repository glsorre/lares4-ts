import type {
  Lares4Output,
  Lares4SystemStatus,
  Lares4SensorStatus,
  Lares4ThermostatConfiguration,
  Lares4ThermostatSeasonConfiguration,
  Lares4Scenario,
  Lares4DomusStatus
} from "../index";

import { Lares4 } from "../lib/Lares4";

export function outputStatus(that: Lares4, id?: number): string {
  const output = that.accessories.outputs?.find(output => Number(output.ID) === id);
  const output_status = that.status.outputs?.find(output => Number(output.ID) === id);
  if (output_status) {
    const status_string = `${output_status.STA}${output_status.POS ? ` at ${output_status.POS}` : ''}`;
    return `Output ${id} has type ${output?.CAT} is ${status_string} named ${output?.DES}`;
  } else {
    that.logger.warn(`Output ${id} not found`);
    return `Output ${id} not found`;
  }
}

export function outputs(that: Lares4, outputs?: Lares4Output[]): string {
  let result = "Current outputs status: \n";
  outputs?.forEach((output, index, outputs) => {
    if (index === outputs.length - 1) {
      result = `${result} ${outputStatus(that, Number(output.ID))}`;
    } else result = `${result} ${outputStatus(that, Number(output.ID))} \n`
  });
  return result;
}

export function systemStatus(that: Lares4, id: number): string {
  const status = that.status.systems?.find(status => Number(status.ID) === id);
  if (status) {
    return `System ${status.ID}: Internal temperature: ${status.TEMP?.IN}, External temperature: ${status.TEMP?.OUT}`;
  } else {
    that.logger.warn(`System ${id} not found`);
    return `System ${id} not found`;
  }
}

export function systemsStatus(that: Lares4, systems?: Lares4SystemStatus[]): string {
  let result = "Current systems status: \n";
  systems?.forEach((system, index, systems) => {
    if (index === systems.length - 1) {
      result = `${result} ${systemStatus(that, Number(system.ID))}`;
    } else result = `${result} ${systemStatus(that, Number(system.ID))} \n`
  });
  return result;
}

export function sensorStatus(that: Lares4, id: number): string {
  const sensor = that.status.sensors?.find(sensor => Number(sensor.ID) === id) as Lares4SensorStatus;
  let result = '';
  if (sensor) {
    result = `Sensor ${sensor.ID}, type ${sensor.TYP}: ${sensor.STA}`;
    if (sensor.TYP === 'DOMUS') {
      const domus = sensor.DOMUS as Lares4DomusStatus;
      result = `${result} Temperature: ${domus.TEM}, Humidity: ${domus.HUM}, Lighting: ${domus.LHT}`;
    }
    return result
  } else {
    that.logger.warn(`Sensor ${id} not found`);
    return `Sensor ${id} not found`;
  }
}

export function sensorsStatus(that: Lares4, sensors?: Lares4SensorStatus[]): string {
  let result = "Current sensors status: \n";
  sensors?.forEach((sensor, index, sensors) => {
    if (index === sensors.length - 1) {
      result = `${result} ${sensorStatus(that, Number(sensor.ID))}`;
    } else result = `${result} ${sensorStatus(that, Number(sensor.ID))} \n`
  });
  return result;
}

export function thermostatStatus(that: Lares4, id: number): string {
  const thermostat = that.configuration.thermostats?.find(thermostat => Number(thermostat.ID) === id);
  if (thermostat) {
    return `Thermostat ${id} is ${thermostat?.ACT_MODE} during ${thermostat?.ACT_SEA}`;
  } else {
    that.logger.warn(`Thermostat ${id} not found`);
    return `Thermostat ${id} not found`;
  }
}

export function thermostatsStatus(that: Lares4, thermostats?: Lares4ThermostatConfiguration[]): string {
  let result = "Current thermostats status: \n";
  thermostats?.forEach((thermostat, index, thermostats) => {
    if (index === thermostats.length - 1) {
      result = `${result} ${thermostatStatus(that, Number(thermostat.ID))}`;
    } else result = `${result} ${thermostatStatus(that, Number(thermostat.ID))} \n`
  });
  return result;
}

export function thermostatConfiguration(that: Lares4, id: number): string {
  const thermostat = that.configuration.thermostats?.find(thermostat => Number(thermostat.ID) === id);
  let result = '';
  if (thermostat) {
    const configuration = thermostat[thermostat.ACT_SEA as keyof Lares4ThermostatConfiguration] as Lares4ThermostatSeasonConfiguration;
    return `Thermostat ${id} configuration: T1 ${configuration.T1}, T2 ${configuration.T2}, T3 ${configuration.T3}`;
  } else {
    that.logger.warn(`Thermostat ${id} not found`);
    return `Thermostat ${id} not found`;
  }
}

export function thermostatsConfiguration(that: Lares4, thermostats?: Lares4ThermostatConfiguration[]): string {
  let result = "Current thermostats configuration: \n";
  thermostats?.forEach((thermostat, index, thermostats) => {
    if (index === thermostats.length - 1) {
      result = `${result} ${thermostatConfiguration(that, Number(thermostat.ID))}`;
    } else result = `${result} ${thermostatConfiguration(that, Number(thermostat.ID))} \n`
  });
  return result;
}

export function scenario(that: Lares4, id: number): string {
  const scenario = that.configuration.scenarios?.find(scenario => Number(scenario.ID) === id);
  if (scenario) {
    return `Scenario ${id} is ${scenario.DES} has category ${scenario.CAT}`;
  } else {
    that.logger.warn(`Scenario ${id} not found`);
    return `Scenario ${id} not found`;
  }
}

export function scenarios(that: Lares4, scenarios?: Lares4Scenario[]): string {
  let result = "Current scenarios: \n";
  scenarios?.forEach((scn, index, scenarios) => {
    if (index === scenarios.length - 1) {
      result = `${result} ${scenario(that, Number(scn.ID))}`;
    } else result = `${result} ${scenario(that, Number(scn.ID))} \n`
  });
  return result;
}

export function temperatureStatus(that: Lares4, id: number): string {
  const temperatureStatus = that.status.temperatures?.find(sensor => Number(sensor.ID) === id);
  if (temperatureStatus) {
    return `Temperature sensor ${id} has value ${temperatureStatus.TEMP} with mode ${temperatureStatus.THERM.ACT_MODEL} in season ${temperatureStatus.THERM.ACT_SEA}`;
  } else {
    that.logger.warn(`Temperature sensor ${id} not found`);
    return `Temperature sensor ${id} not found`;
  }
}

export function temperaturesStatus(that: Lares4, temperatures?: Lares4SensorStatus[]): string {
  let result = "Current temperatures status: \n";
  temperatures?.forEach((temperature, index, temperatures) => {
    if (index === temperatures.length - 1) {
      result = `${result} ${temperatureStatus(that, Number(temperature.ID))}`;
    } else result = `${result} ${temperatureStatus(that, Number(temperature.ID))} \n`
  });
  return result;
}

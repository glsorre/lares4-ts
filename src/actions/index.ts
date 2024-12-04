import type { Lares4ThermostatActModes, Lares4ThermostatSeasons } from "../index";

import { Lares4 } from "../lib/Lares4";

export function debounceWithLock<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (lockDuration: number, ...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecutionTime = 0;

  return (lockDuration: number, ...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecutionTime < lockDuration) {
      return;
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
      lastExecutionTime = Date.now();
      timeoutId = null;
    }, delay);
  };
}

export function switchOn(that: Lares4, id: number) {
  that.setOutput(id, "ON");
}

export function switchOff(that: Lares4, id: number) {
  that.setOutput(id, "OFF");
}

export function dimmerTo(that: Lares4, id: number, level: number) {
  that.setOutput(id, level);
}

export function rollUp(that: Lares4, id: number) {
  that.setOutput(id, "UP");
}

export function rollDown(that: Lares4, id: number) {
  that.setOutput(id, "DOWN");
}

export function rollStop(that: Lares4, id: number) {
  that.setOutput(id, "STOP");
}

export function triggerScenario(that: Lares4, id: number) {
  that.triggerScenario(id);
}

export function setThermostatMode(
  that: Lares4,
  id: number,
  mode: Lares4ThermostatActModes
) {
  that.setThermostatMode(id, mode);
}

export function setThermostatManualTimeout(
  that: Lares4,
  id: number,
  timeout_time: string
) {
  that.setThermostatManualEnding(id, timeout_time);
}

export function setThermostatSeason(
  that: Lares4,
  id: number,
  season: Lares4ThermostatSeasons
) {
  that.setThermostatSeason(id, season);
}

export function setThermostatTarget(
  that: Lares4,
  id: number,
  season: Lares4ThermostatSeasons,
  target: number
) {
  that.setThermostatTarget(id, season, target);
}

export function rollTo(
  that: Lares4,
  id: number,
  target_position: number
): void {
  that.setOutput(id, target_position);
}
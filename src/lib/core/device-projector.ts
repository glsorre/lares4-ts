import {
  Lares4Cover,
  Lares4DeviceTypes,
  Lares4Gate,
  Lares4Light,
  Lares4OutputCategories,
  Lares4Switch,
  Output,
  OutputStatus,
  mapCoverState,
} from '../../types';
import { parseIntegerInRange } from './parse';

/** Panel sometimes exposes thermostatic outputs in generic categories; avoid misclassifying as lights. */
const THERMOSTAT_CATEGORY_HINT =
  /therm|clima|temp|riscald|raffres|hvac|termos/i;

/** Panel often uses a generic output CAT (e.g. dimmer) for roller motors; infer cover from the user label. */
const COVER_DESCRIPTION_HINT =
  /avvolgibile|tapparella|persiana|serranda|tenda|\b(roller|shutter|blind|awning)\b/i;

/** Non-security auxiliary outputs that should remain mapped as switches. */
const AUX_SWITCH_DESCRIPTION_HINT =
  /caldaia|\bboiler\b|crepuscolare|twilight|fotocell|photocell|pulsanti|\bbuttons?\b|relay|rele|irrigaz|pompa|pump|ventola|fan/i;

/** Security/alarm labels frequently used for sirens/strobes/anti-intrusion actuators. */
const SECURITY_SWITCH_DESCRIPTION_HINT =
  /allarme|alarm|sirena|\bsiren\b|strobe|lampegg|tamper|intrusion|intrusione|antintrus|segnalatore|panic|antipanico/i;

export type ProjectedOutputType = 'light' | 'cover' | 'gate' | 'switch' | 'thermostat';

function outputDescriptionSuggestsCover(description: string): boolean {
  return COVER_DESCRIPTION_HINT.test(description.trim());
}

function outputDescriptionSuggestsSwitch(description: string): boolean {
  const normalized = description.trim();
  return AUX_SWITCH_DESCRIPTION_HINT.test(normalized);
}

function outputDescriptionSuggestsSiren(description: string): boolean {
  return SECURITY_SWITCH_DESCRIPTION_HINT.test(description.trim());
}

function shouldExcludeSwitchOutput(output: Output): boolean {
  const cnv = String(output.CNV ?? '').toUpperCase();
  const description = String(output.DES ?? '');
  return cnv === 'H' || outputDescriptionSuggestsSiren(description);
}

export function determineOutputType(categoryRaw: string | undefined, modeRaw: string | undefined, descriptionRaw: string | undefined): ProjectedOutputType {
  const category = String(categoryRaw ?? '').toUpperCase();
  const mode = String(modeRaw ?? '').toUpperCase();
  const description = String(descriptionRaw ?? '');

  if (category === String(Lares4OutputCategories.ROLL).toUpperCase()) {
    return 'cover';
  }

  if (category === String(Lares4OutputCategories.GATE).toUpperCase()) {
    return mode === 'M' ? 'gate' : 'cover';
  }

  if (THERMOSTAT_CATEGORY_HINT.test(category)) {
    return 'thermostat';
  }

  if (outputDescriptionSuggestsCover(description)) {
    return 'cover';
  }

  if (outputDescriptionSuggestsSwitch(description)) {
    return 'switch';
  }

  return 'light';
}

export function projectOutputDevice(output: Output, status: OutputStatus): Lares4Light | Lares4Cover | Lares4Gate | Lares4Switch | null {
  const id = parseInt(output.ID, 10);
  const description = output.DES ?? '';
  const projectedType = determineOutputType(output.CAT, output.MOD, description);
  const excludedSwitch = projectedType === 'switch' && shouldExcludeSwitchOutput(output);

  if (excludedSwitch) {
    return null;
  }

  switch (projectedType) {
  case 'cover':
    return {
      id,
      type: Lares4DeviceTypes.COVER,
      description,
      position: parseIntegerInRange(status.POS, 0, 100) ?? 0,
      targetPosition: parseIntegerInRange(status.TPOS ?? status.POS, 0, 100) ?? 0,
      state: mapCoverState(status.STA),
    } as Lares4Cover;
  case 'gate':
    return {
      id,
      type: Lares4DeviceTypes.GATE,
      description,
      on: status.STA?.toUpperCase() === 'ON',
    } as Lares4Gate;
  case 'switch':
    return {
      id,
      type: Lares4DeviceTypes.SWITCH,
      description,
      on: status.STA?.toUpperCase() === 'ON',
    } as Lares4Switch;
  case 'thermostat':
    return null;
  default:
    return {
      id,
      type: Lares4DeviceTypes.LIGHT,
      description,
      brightness: parseIntegerInRange(status.POS, 0, 100) ?? 0,
      on: status.STA?.toUpperCase() === 'ON',
      dimmable: status.POS !== undefined,
    } as Lares4Light;
  }
}

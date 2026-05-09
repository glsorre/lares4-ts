export function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function parseIntegerInRange(
  value: string | number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return clampValue(parsed, min, max);
}

export function parseFloatInRange(
  value: string | number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().replace(',', '.').replace('+', '');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return clampValue(parsed, min, max);
}

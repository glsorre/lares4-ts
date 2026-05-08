import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapActMode,
  mapSeason,
  mapCoverState,
  Lares4ThermostatActModes,
  Lares4ThermostatSeasons,
  Lares4CoverStates,
} from '../src/types';

describe('mapActMode', () => {
  it('returns known values as-is', () => {
    assert.equal(mapActMode('OFF'), Lares4ThermostatActModes.off);
    assert.equal(mapActMode('MAN'), Lares4ThermostatActModes.manual);
    assert.equal(mapActMode('MAN_TMR'), Lares4ThermostatActModes.manual_timer);
    assert.equal(mapActMode('WEEKLY'), Lares4ThermostatActModes.weekly);
    assert.equal(mapActMode('SD1'), Lares4ThermostatActModes.special1);
    assert.equal(mapActMode('SD2'), Lares4ThermostatActModes.special2);
  });

  it('falls back to off for unknown value', () => {
    assert.equal(mapActMode('UNKNOWN'), Lares4ThermostatActModes.off);
  });

  it('falls back to off for empty string', () => {
    assert.equal(mapActMode(''), Lares4ThermostatActModes.off);
  });

  it('falls back to off for mixed-case input', () => {
    assert.equal(mapActMode('manual'), Lares4ThermostatActModes.off);
  });
});

describe('mapSeason', () => {
  it('returns known values as-is', () => {
    assert.equal(mapSeason('WIN'), Lares4ThermostatSeasons.winter);
    assert.equal(mapSeason('SUM'), Lares4ThermostatSeasons.summer);
  });

  it('falls back to winter for unknown value', () => {
    assert.equal(mapSeason('UNKNOWN'), Lares4ThermostatSeasons.winter);
  });

  it('falls back to winter for empty string', () => {
    assert.equal(mapSeason(''), Lares4ThermostatSeasons.winter);
  });

  it('falls back to winter for mixed-case input', () => {
    assert.equal(mapSeason('win'), Lares4ThermostatSeasons.winter);
  });
});

describe('mapCoverState', () => {
  it('returns known values as-is', () => {
    assert.equal(mapCoverState('opening'), Lares4CoverStates.OPENING);
    assert.equal(mapCoverState('closing'), Lares4CoverStates.CLOSING);
    assert.equal(mapCoverState('stopped'), Lares4CoverStates.STOPPED);
  });

  it('falls back to stopped for unknown value', () => {
    assert.equal(mapCoverState('UNKNOWN'), Lares4CoverStates.STOPPED);
  });

  it('falls back to stopped for empty string', () => {
    assert.equal(mapCoverState(''), Lares4CoverStates.STOPPED);
  });

  it('falls back to stopped for uppercase input', () => {
    assert.equal(mapCoverState('OPENING'), Lares4CoverStates.STOPPED);
  });
});

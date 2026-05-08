import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4, Lares4Factory, type Lares4Info } from '../../../src/lib/public/lares4';
import {
  Lares4CoverStates,
  Lares4DeviceTypes,
  Lares4DeviceUpdateEvent,
  Lares4OutputCategories,
  Lares4ThermostatActModes,
  Lares4ThermostatSeasons,
  ThermostatActModes,
  ThermostatSeasons,
} from '../../../src/types';
import { Deferred } from '../../../src/utils';

function createMockInfo(): Lares4Info {
  return {
    lights: {
      1: { id: 1, type: Lares4DeviceTypes.LIGHT, description: 'Light 1', brightness: 0, on: false, dimmable: true },
      2: { id: 2, type: Lares4DeviceTypes.LIGHT, description: 'Light 2', brightness: 50, on: true, dimmable: true },
    },
    covers: {
      3: { id: 3, type: Lares4DeviceTypes.COVER, description: 'Cover 1', position: 0, targetPosition: 0, state: Lares4CoverStates.STOPPED },
      4: { id: 4, type: Lares4DeviceTypes.COVER, description: 'Cover 2', position: 100, targetPosition: 100, state: Lares4CoverStates.OPENING },
    },
    gates: {
      5: { id: 5, type: Lares4DeviceTypes.GATE, description: 'Gate 1', on: false },
    },
    scenarios: {
      6: { id: 6, type: Lares4DeviceTypes.SCENARIO, description: 'Scenario 1', category: 'ARM' },
      7: { id: 7, type: Lares4DeviceTypes.SCENARIO, description: 'Scenario 2', category: 'CUSTOM' },
    },
    thermostats: {
      8: {
        id: 8,
        type: Lares4DeviceTypes.THERMOSTAT,
        description: 'Thermostat 1',
        currentTemperature: 20,
        targetTemperature: 22,
        mode: Lares4ThermostatActModes.manual,
        season: Lares4ThermostatSeasons.winter,
        manualEnd: 0,
        enabled: true,
      },
    },
    sensors: {
      9: { id: 9, type: Lares4DeviceTypes.SENSOR, description: 'Sensor 1', sensors: [] },
    },
    zones: {
      10: { id: 10, type: Lares4DeviceTypes.ZONE, description: 'Zone 1', armed: false, bypassed: false, fault: false, open: false },
    },
  };
}

function createLaresWithStubs() {
  const lares4 = new Lares4('test-sender', '123456', '192.168.1.100', true);
  const sent: Array<[string, string, Record<string, unknown>]> = [];
  const stubSocket = {
    send: (cmd: string, payloadType: string, payload: Record<string, unknown>) => {
      sent.push([cmd, payloadType, payload]);
    },
    open: async () => undefined,
    messages: {
      subscribe: () => undefined,
    },
  };

  (lares4 as unknown as { _ws: typeof stubSocket })._ws = stubSocket;
  (lares4 as unknown as { _lares4: Lares4Info })._lares4 = createMockInfo();
  return { lares4, sent, stubSocket };
}

describe('Lares4', () => {
  it('is created and exposes sorted getters', () => {
    const { lares4 } = createLaresWithStubs();
    assert.ok(lares4);
    assert.deepEqual(lares4.lights.map((d) => d.id), [1, 2]);
    assert.deepEqual(lares4.covers.map((d) => d.id), [3, 4]);
    assert.deepEqual(lares4.gates.map((d) => d.id), [5]);
    assert.deepEqual(lares4.scenarios.map((d) => d.id), [7]);
    assert.deepEqual(lares4.thermostats.map((d) => d.id), [8]);
    assert.deepEqual(lares4.sensors.map((d) => d.id), [9]);
    assert.deepEqual(lares4.zones.map((d) => d.id), [10]);
    assert.deepEqual(lares4.outputs.map((d) => d.id), [1, 2, 3, 4, 5]);
  });

  it('factory creates and runs instance', async () => {
    const run = Lares4.prototype.run;
    let called = 0;
    Lares4.prototype.run = async function mockRun() {
      called += 1;
      return Promise.resolve();
    };

    const instance = await Lares4Factory.createLares4('factory-sender', '1234', '192.168.1.1', false);
    assert.ok(instance instanceof Lares4);
    assert.equal(called, 1);
    Lares4.prototype.run = run;
  });

  it('run subscribes socket messages and opens connection', async () => {
    const { lares4, stubSocket } = createLaresWithStubs();
    let subscribed = 0;
    let opened = 0;
    stubSocket.messages.subscribe = () => {
      subscribed += 1;
    };
    stubSocket.open = async () => {
      opened += 1;
    };

    await lares4.run();
    assert.equal(subscribed, 1);
    assert.equal(opened, 1);
  });

  it('command methods emit expected socket payloads', () => {
    const { lares4, sent } = createLaresWithStubs();

    lares4.setOutput(1, 'ON');
    lares4.triggerScenario(7);
    lares4.setThermostatMode(8, ThermostatActModes.MANUAL);
    lares4.setThermostatManualEnding(8, '0100');
    lares4.setThermostatSeason(8, ThermostatSeasons.SUM);
    lares4.setThermostatTarget(8, ThermostatSeasons.WIN, 21);

    assert.equal(sent.length, 6);
    assert.equal(sent[0][0], 'CMD_USR');
    assert.equal(sent[0][1], 'CMD_SET_OUTPUT');
    assert.deepEqual(sent[0][2], {
      ID_LOGIN: 'true',
      PIN: 'true',
      OUTPUT: { ID: '1', STA: 'ON' },
    });
  });

  it('parseEventPayload handles object and empty payloads', () => {
    const { lares4 } = createLaresWithStubs();
    const parsedObject = (lares4 as unknown as {
      parseEventPayload: (data: { message?: string | Record<string, unknown> }) => { PAYLOAD: Record<string, unknown> };
    }).parseEventPayload({
      message: { STATUS_OUTPUTS: [] },
    });
    assert.ok(parsedObject.PAYLOAD.STATUS_OUTPUTS);

    const parsedEmpty = (lares4 as unknown as {
      parseEventPayload: (data: { message?: string | Record<string, unknown> }) => { PAYLOAD: Record<string, unknown> };
    }).parseEventPayload({});
    assert.deepEqual(parsedEmpty.PAYLOAD, {});
  });

  it('handleChange ignores receiver mismatch safely', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange({
      message: {
        sender_other: {
          STATUS_OUTPUTS: [{ ID: '1', STA: 'on', POS: 10 }],
        },
      },
    });

    assert.equal(lares4.lights[0].on, false);
  });

  it('handleOpen sends initial read then realtime registration after deferred resolution', async () => {
    const { lares4, sent } = createLaresWithStubs();
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const promise = handleOpen();

    assert.equal(sent[0][0], 'READ');
    assert.equal(sent[0][1], 'MULTI_TYPES');

    const deferreds = (lares4 as unknown as { _deferreds: Map<string, Deferred> })._deferreds;
    for (const deferred of deferreds.values()) {
      deferred.resolve(undefined);
    }
    await promise;

    assert.equal(sent[1][0], 'REALTIME');
    assert.equal(sent[1][1], 'REGISTER');
  });

  it('handleMultiTypes populates mapped entities from payload', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '1', CAT: Lares4OutputCategories.LIGHT, DES: 'Light A' },
          { ID: '3', CAT: Lares4OutputCategories.ROLL, DES: 'Cover A' },
          { ID: '5', CAT: Lares4OutputCategories.GATE, DES: 'Gate A' },
        ],
        STATUS_OUTPUTS: [
          { ID: '1', STA: 'ON', POS: '75' },
          { ID: '3', STA: 'OPENING', POS: '10', TPOS: '50' },
          { ID: '5', STA: 'OFF', POS: '0' },
        ],
        ZONES: [{ ID: '10', DES: 'Zone A' }],
        STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'NO', FM: 'F', STA: 'A' }],
        BUS_HAS: [{ ID: '9', DES: 'Sensor A' }],
        STATUS_BUS_HA_SENSORS: [{ ID: '8', DOMUS: 'Y', DES: 'Therm Sensor' }],
        STATUS_TEMPERATURES: [{ ID: '8', TEMP: '22', THERM: { OUT_STATUS: 'ON' } }],
        CFG_THERMOSTATS: [{ ID: '8', WIN: { TM: '21' }, ACT_MODE: 'MAN', ACT_SEA: 'WIN', MAN_HRS: '2' }],
        SCENARIOS: [{ ID: '7', DES: 'Scenario A', CAT: 'CUSTOM' }],
      },
    });

    assert.equal(lares4.lights.find((d) => d.id === 1)?.on, true);
    assert.equal(lares4.lights.find((d) => d.id === 1)?.dimmable, true);
    assert.equal(lares4.covers.find((d) => d.id === 3)?.position, 10);
    assert.equal(lares4.gates.find((d) => d.id === 5)?.description, 'Gate A');
    assert.equal(lares4.gates.find((d) => d.id === 5)?.on, false);
    assert.equal(lares4.zones.find((d) => d.id === 10)?.armed, true);
    assert.equal(lares4.sensors.find((d) => d.id === 9)?.description, 'Sensor A');
    assert.equal(lares4.thermostats.find((d) => d.id === 8)?.targetTemperature, 21);
    assert.equal(lares4.scenarios.find((d) => d.id === 7)?.description, 'Scenario A');
  });

  it('handleMultiTypes sets dimmable based on POS field presence not value', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '1', CAT: Lares4OutputCategories.LIGHT, DES: 'Dimmer at 0' },
          { ID: '2', CAT: Lares4OutputCategories.LIGHT, DES: 'On/Off switch' },
        ],
        STATUS_OUTPUTS: [
          { ID: '1', STA: 'OFF', POS: '0' },
          { ID: '2', STA: 'OFF' },
        ],
      },
    });

    assert.equal(lares4.lights.find((d) => d.id === 1)?.dimmable, true);
    assert.equal(lares4.lights.find((d) => d.id === 1)?.brightness, 0);
    assert.equal(lares4.lights.find((d) => d.id === 2)?.dimmable, false);
  });

  it('handleMultiTypes resets selected stores on missing payload branches', () => {
    const { lares4 } = createLaresWithStubs();
    const warnings: string[] = [];
    (lares4 as unknown as { _logger: { warn: (msg: string) => void } })._logger = {
      warn: (msg: string) => warnings.push(msg),
    } as never;
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({ message: {} });

    assert.deepEqual(lares4.zones, []);
    assert.deepEqual(lares4.sensors, []);
    assert.deepEqual(lares4.scenarios, []);
    assert.ok(warnings.length >= 3);
  });

  it('handleChange updates outputs, sensors, temperatures and zones for matching sender', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [
            { ID: '1', STA: 'on', POS: 33 },
            { ID: '3', STA: 'open', POS: 44 },
          ],
          STATUS_BUS_HA_SENSORS: [{ ID: '9', TEMP: 18, HUMIDITY: 40, LIGHT: 200 }],
          STATUS_TEMPERATURES: [{ ID: '8', TEMP: 19, THERM: { ACT_MODEL: 'MAN', ACT_SEA: 'WIN', OUT_STATUS: 'ON' } }],
          STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'YES', FM: 'T', STA: 'A' }],
        },
      },
    });

    assert.equal(lares4.lights.find((d) => d.id === 1)?.brightness, 33);
    assert.equal(lares4.covers.find((d) => d.id === 3)?.position, 44);
    assert.equal(lares4.sensors.find((d) => d.id === 9)?.sensors[0].value, 18);
    assert.equal(lares4.thermostats.find((d) => d.id === 8)?.currentTemperature, 19);
    assert.equal(lares4.zones.find((d) => d.id === 10)?.bypassed, true);
  });

  it('parseEventPayload returns empty message on invalid JSON string payload', () => {
    const { lares4 } = createLaresWithStubs();
    const errors: string[] = [];
    (lares4 as unknown as { _logger: { warn: () => void; error: (m: string) => void; info: () => void; debug: () => void } })._logger = {
      warn: () => undefined,
      error: (m: string) => errors.push(m),
      info: () => undefined,
      debug: () => undefined,
    } as never;
    const parseEventPayload = (lares4 as unknown as {
      parseEventPayload: (data: { message?: string | Record<string, unknown> }) => { PAYLOAD: Record<string, unknown> };
    }).parseEventPayload.bind(lares4);

    const result = parseEventPayload({ message: '{invalid' });
    assert.deepEqual(result.PAYLOAD, {});
    assert.ok(errors.some(e => e.includes('Failed to parse')));
  });

  it('handleOpen completes naturally when handleMultiTypes resolves all deferreds', async () => {
    const { lares4, sent } = createLaresWithStubs();
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    const promise = handleOpen();

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '1', CAT: Lares4OutputCategories.LIGHT, DES: 'Light A' }],
        STATUS_OUTPUTS: [{ ID: '1', STA: 'ON', POS: '75' }],
        ZONES: [{ ID: '10', DES: 'Zone A' }],
        STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'NO', FM: 'F', STA: 'A' }],
        BUS_HAS: [{ ID: '9', DES: 'Sensor A' }],
        STATUS_BUS_HA_SENSORS: [{ ID: '8', DOMUS: 'Y', DES: 'Therm Sensor' }],
        STATUS_TEMPERATURES: [{ ID: '8', TEMP: '22', THERM: { OUT_STATUS: 'ON' } }],
        CFG_THERMOSTATS: [{ ID: '8', WIN: { TM: '21' }, ACT_MODE: 'MAN', ACT_SEA: 'WIN', MAN_HRS: '2' }],
        SCENARIOS: [{ ID: '7', DES: 'Scenario A', CAT: 'CUSTOM' }],
      },
    });

    await promise;

    assert.equal(sent[0][0], 'READ');
    assert.equal(sent[0][1], 'MULTI_TYPES');
    assert.equal(sent[1][0], 'REALTIME');
    assert.equal(sent[1][1], 'REGISTER');
  });

  it('handleOpen proceeds to update() even when some deferreds reject', async () => {
    const { lares4, sent } = createLaresWithStubs();
    const warnings: string[] = [];
    (lares4 as unknown as { _logger: { warn: (msg: string) => void; error: () => void; info: () => void; debug: () => void } })._logger = {
      warn: (msg: string) => warnings.push(msg),
      error: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    } as never;
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    const promise = handleOpen();
    handleMultiTypes({ message: {} });
    await promise;

    assert.equal(sent[1][0], 'REALTIME');
    assert.equal(sent[1][1], 'REGISTER');
    assert.ok(warnings.some(w => w.includes('unavailable')));
  });

  it('handleChange skips STATUS_OUTPUTS update for unknown device ID without throwing', () => {
    const { lares4 } = createLaresWithStubs();
    const warnings: string[] = [];
    (lares4 as unknown as { _logger: { warn: (msg: string) => void; error: () => void; info: () => void; debug: () => void } })._logger = {
      warn: (msg: string) => warnings.push(msg),
      error: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    } as never;
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    assert.doesNotThrow(() => handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [{ ID: '99', STA: 'on', POS: 50 }],
        },
      },
    }));
    assert.ok(warnings.some(w => w.includes('99')));
  });

  it('handleChange updates scenarios for matching sender', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    assert.equal(lares4.scenarios.find(s => s.id === 7)?.description, 'Scenario 2');

    handleChange({
      message: {
        'test-sender': {
          SCENARIOS: [{ ID: '7', DES: 'Scenario 2 Updated', CAT: 'CUSTOM' }],
        },
      },
    });

    assert.equal(lares4.scenarios.find(s => s.id === 7)?.description, 'Scenario 2 Updated');
  });

  it('handleClose clears deferreds and handleOpen reinitialises on reconnect', async () => {
    const { lares4, sent } = createLaresWithStubs();
    const handleClose = (lares4 as unknown as { handleClose: () => void }).handleClose.bind(lares4);
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);
    const deferreds = (lares4 as unknown as { _deferreds: Map<string, Deferred> })._deferreds;

    const fullPayload = {
      OUTPUTS: [{ ID: '1', CAT: Lares4OutputCategories.LIGHT, DES: 'Light A' }],
      STATUS_OUTPUTS: [{ ID: '1', STA: 'ON', POS: '75' }],
      ZONES: [{ ID: '10', DES: 'Zone A' }],
      STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'NO', FM: 'F', STA: 'A' }],
      BUS_HAS: [{ ID: '9', DES: 'Sensor A' }],
      STATUS_BUS_HA_SENSORS: [{ ID: '8', DOMUS: 'Y', DES: 'Therm Sensor' }],
      STATUS_TEMPERATURES: [{ ID: '8', TEMP: '22', THERM: { OUT_STATUS: 'ON' } }],
      CFG_THERMOSTATS: [{ ID: '8', WIN: { TM: '21' }, ACT_MODE: 'MAN', ACT_SEA: 'WIN', MAN_HRS: '2' }],
      SCENARIOS: [{ ID: '7', DES: 'Scenario A', CAT: 'CUSTOM' }],
    };

    const firstOpen = handleOpen();
    handleMultiTypes({ message: fullPayload });
    await firstOpen;
    assert.equal(sent.length, 2);

    handleClose();
    assert.equal(deferreds.size, 0);

    const secondOpen = handleOpen();
    assert.ok(deferreds.size > 0);
    handleMultiTypes({ message: fullPayload });
    await secondOpen;

    assert.equal(sent.length, 4);
    assert.equal(sent[2][0], 'READ');
    assert.equal(sent[2][1], 'MULTI_TYPES');
    assert.equal(sent[3][0], 'REALTIME');
    assert.equal(sent[3][1], 'REGISTER');
  });

  it('onUpdate fires typed events for each handleChange case', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    const received: Lares4DeviceUpdateEvent[] = [];
    const unsub = lares4.onUpdate((event) => received.push(event));

    handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [
            { ID: '1', STA: 'on', POS: 50 },
            { ID: '3', STA: 'open', POS: 75 },
          ],
          STATUS_BUS_HA_SENSORS: [{ ID: '9', TEMP: 21, HUMIDITY: 55, LIGHT: 300 }],
          STATUS_TEMPERATURES: [{ ID: '8', TEMP: 20, THERM: { ACT_MODEL: 'MAN', ACT_SEA: 'WIN', OUT_STATUS: 'ON' } }],
          STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'NO', FM: 'F', STA: 'A' }],
          SCENARIOS: [{ ID: '7', DES: 'Updated Scenario', CAT: 'CUSTOM' }],
        },
      },
    });

    assert.equal(received.length, 6);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.LIGHT)?.type, Lares4DeviceTypes.LIGHT);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.COVER)?.type, Lares4DeviceTypes.COVER);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.SENSOR)?.type, Lares4DeviceTypes.SENSOR);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.THERMOSTAT)?.type, Lares4DeviceTypes.THERMOSTAT);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.ZONE)?.type, Lares4DeviceTypes.ZONE);
    assert.equal(received.find((e) => e.type === Lares4DeviceTypes.SCENARIO)?.type, Lares4DeviceTypes.SCENARIO);

    unsub();
    handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [{ ID: '1', STA: 'off', POS: 0 }],
        },
      },
    });
    assert.equal(received.length, 6);
  });

  it('handleChange falls back to OFF/WIN defaults when THERM is absent', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    handleChange({
      message: {
        'test-sender': {
          STATUS_TEMPERATURES: [{ ID: '8', TEMP: 20 }],
        },
      },
    });

    const therm = lares4.thermostats.find((d) => d.id === 8);
    assert.equal(therm?.currentTemperature, 20);
    assert.equal(therm?.mode, 'OFF');
    assert.equal(therm?.season, 'WIN');
    assert.equal(therm?.enabled, false);
  });
});
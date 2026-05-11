import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4, Lares4Factory, type Lares4Info, type Lares4Options } from '../../../src/lib/public/lares4';
import {
  Lares4CoverStates,
  Lares4DeviceDiscoveredEvent,
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
    switches: {},
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
    systemStatus: {
      temperatures: [],
    },
  };
}

function createLaresWithStubs(options?: Lares4Options) {
  const lares4 = new Lares4('test-sender', '123456', '192.168.1.100', true, options);
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
    assert.deepEqual(lares4.switches, []);
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
      (lares4 as unknown as { _initialSync?: Deferred<void> })._initialSync?.resolve();
    };

    await lares4.run();
    assert.equal(subscribed, 1);
    assert.equal(opened, 1);
  });

  it('onSent fires with raw + parsed command and unsubscribe stops further events', () => {
    const { lares4 } = createLaresWithStubs();
    const received: Array<{ raw: string; command: { CMD: string; PAYLOAD: Record<string, unknown> } }> = [];
    const unsubscribe = lares4.onSent((event) => {
      received.push({ raw: event.raw, command: { CMD: event.command.CMD, PAYLOAD: event.command.PAYLOAD } });
    });

    const handleSent = (lares4 as unknown as {
      handleSent: (data: { message?: string | Record<string, unknown> }) => void;
    }).handleSent.bind(lares4);

    const frameA = JSON.stringify({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'READ',
      ID: '1',
      PAYLOAD_TYPE: 'STATUS_OUTPUTS',
      PAYLOAD: { foo: 'bar' },
      TIMESTAMP: '1',
      CRC_16: '0x0000',
    });
    handleSent({ message: frameA });

    unsubscribe();

    const frameB = JSON.stringify({
      SENDER: 'A',
      RECEIVER: 'B',
      CMD: 'CMD_USR',
      ID: '2',
      PAYLOAD_TYPE: 'CMD_SET_OUTPUT',
      PAYLOAD: {},
      TIMESTAMP: '2',
      CRC_16: '0x0000',
    });
    handleSent({ message: frameB });

    assert.equal(received.length, 1);
    assert.equal(received[0].raw, frameA);
    assert.equal(received[0].command.CMD, 'READ');
    assert.deepEqual(received[0].command.PAYLOAD, { foo: 'bar' });
  });

  it('onSent silently warns and skips emit on malformed raw payload', () => {
    const warnings: string[] = [];
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _logger: { warn: (m: string) => void } })._logger = {
      warn: (message: string) => warnings.push(message),
    };
    let calls = 0;
    lares4.onSent(() => {
      calls += 1;
    });

    const handleSent = (lares4 as unknown as {
      handleSent: (data: { message?: string | Record<string, unknown> }) => void;
    }).handleSent.bind(lares4);
    handleSent({ message: '{not json' });

    assert.equal(calls, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /onSent parse failed/);
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
          { ID: '5', CAT: Lares4OutputCategories.GATE, MOD: 'M', DES: 'Gate A' },
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
    assert.equal(lares4.zones.find((d) => d.id === 10)?.description, 'Zone A');
    assert.equal(lares4.sensors.find((d) => d.id === 9)?.description, 'Sensor A');
    assert.equal(lares4.thermostats.find((d) => d.id === 8)?.targetTemperature, 21);
    assert.equal(lares4.thermostats.find((d) => d.id === 8)?.description, 'Therm Sensor');
    assert.equal(lares4.scenarios.find((d) => d.id === 7)?.description, 'Scenario A');
  });

  it('handleMultiTypes invokes onMultitypesPayload with payload keys', () => {
    const received: Record<string, unknown>[] = [];
    const { lares4 } = createLaresWithStubs({
      onMultitypesPayload: (p) => received.push(p),
    });
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

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

    assert.equal(received.length, 1);
    assert.ok(Array.isArray(received[0].OUTPUTS));
    assert.ok(Array.isArray(received[0].STATUS_ZONES));
  });

  it('handleMultiTypes matches output CAT case-insensitively', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '1', CAT: 'LIGHT', DES: 'L' },
          { ID: '2', CAT: 'ROLL', DES: 'R' },
          { ID: '3', CAT: 'GATE', MOD: 'M', DES: 'G' },
        ],
        STATUS_OUTPUTS: [
          { ID: '1', STA: 'ON', POS: '5' },
          { ID: '2', STA: 'OPENING', POS: '10', TPOS: '90' },
          { ID: '3', STA: 'ON', POS: '0' },
        ],
      },
    });

    assert.ok(lares4.lights.find((d) => d.id === 1));
    assert.ok(lares4.covers.find((d) => d.id === 2));
    assert.ok(lares4.gates.find((d) => d.id === 3));
  });

  it('handleMultiTypes maps GATE with non-M mode as cover', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '3', CAT: 'GATE', MOD: 'A', DES: 'Sliding gate motor' }],
        STATUS_OUTPUTS: [{ ID: '3', STA: 'OPENING', POS: '10', TPOS: '90' }],
      },
    });

    assert.ok(lares4.covers.find((d) => d.id === 3));
    assert.equal(lares4.gates.find((d) => d.id === 3), undefined);
  });

  it('handleMultiTypes avoids misclassifying thermostat-like output categories as lights', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '31', CAT: 'THERM', DES: 'Thermostat relay output' }],
        STATUS_OUTPUTS: [{ ID: '31', STA: 'ON', POS: '0' }],
      },
    });

    assert.equal(lares4.lights.find((d) => d.id === 31), undefined);
    assert.equal(lares4.outputs.find((d) => d.id === 31), undefined);
  });

  it('handleMultiTypes classifies auxiliary outputs as switches from description when CAT is generic', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '22', CAT: Lares4OutputCategories.LIGHT, DES: 'Caldaia' },
        ],
        STATUS_OUTPUTS: [
          { ID: '22', STA: 'OFF', POS: '0' },
        ],
      },
    });

    assert.ok(lares4.switches.find((d) => d.id === 22));
    assert.equal(lares4.lights.find((d) => d.id === 22), undefined);
  });

  it('excludes alarm-like auxiliary outputs from switches', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '23', CAT: 'DIMMER', DES: 'Sirena Esterna' }],
        STATUS_OUTPUTS: [{ ID: '23', STA: 'ON', POS: '0' }],
      },
    });

    assert.equal(lares4.switches.find((d) => d.id === 23), undefined);
    assert.equal(lares4.lights.find((d) => d.id === 23)?.on, true);
  });

  it('keeps non-security auxiliary outputs as switches even when panel is armed', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '25', CAT: Lares4OutputCategories.LIGHT, DES: 'Crepuscolare' },
          { ID: '26', CAT: Lares4OutputCategories.LIGHT, DES: 'Pulsanti' },
        ],
        STATUS_OUTPUTS: [
          { ID: '25', STA: 'ON', POS: '0' },
          { ID: '26', STA: 'OFF', POS: '0' },
        ],
        STATUS_SYSTEM: [{ ID: '1', ARM: { D: 'Totale', S: 'T' }, ALARM: [], ALARM_MEM: [], TAMPER: [], TAMPER_MEM: [], FAULT: [], FAULT_MEM: [] }],
      },
    });

    assert.ok(lares4.switches.find((d) => d.id === 25));
    assert.ok(lares4.switches.find((d) => d.id === 26));
  });

  it('excludes hidden outputs (CNV=H) from switches', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '24', CAT: Lares4OutputCategories.LIGHT, CNV: 'H', DES: 'Aux Hidden' }],
        STATUS_OUTPUTS: [{ ID: '24', STA: 'ON', POS: '0' }],
      },
    });

    assert.equal(lares4.switches.find((d) => d.id === 24), undefined);
    assert.equal(lares4.lights.find((d) => d.id === 24)?.on, true);
  });

  it('handleMultiTypes classifies roller outputs by description when CAT is generic', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [
          { ID: '10', CAT: Lares4OutputCategories.LIGHT, DES: 'Avvolgibile Soggiorno' },
          { ID: '11', CAT: 'DIMMER', DES: 'Kitchen roller shutter' },
        ],
        STATUS_OUTPUTS: [
          { ID: '10', STA: 'STOPPED', POS: '0', TPOS: '100' },
          { ID: '11', STA: 'opening', POS: '5', TPOS: '50' },
        ],
      },
    });

    assert.ok(lares4.covers.find((d) => d.id === 10));
    assert.ok(lares4.covers.find((d) => d.id === 11));
    assert.equal(lares4.lights.find((d) => d.id === 10), undefined);
    assert.equal(lares4.lights.find((d) => d.id === 11), undefined);
  });

  it('handleMultiTypes uses BUS_HAS description when DOMUS thermostat row omits DES', () => {
    const { lares4 } = createLaresWithStubs();
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '1', CAT: Lares4OutputCategories.LIGHT, DES: 'Light A' }],
        STATUS_OUTPUTS: [{ ID: '1', STA: 'ON', POS: '75' }],
        ZONES: [{ ID: '10', DES: 'Zone A' }],
        STATUS_ZONES: [{ ID: '10', A: 'Y', BYP: 'NO', FM: 'F', STA: 'A' }],
        BUS_HAS: [{ ID: '8', DES: 'Termostato' }],
        STATUS_BUS_HA_SENSORS: [{ ID: '8', DOMUS: 'Y' }],
        STATUS_TEMPERATURES: [{ ID: '8', TEMP: '22', THERM: { OUT_STATUS: 'OFF' } }],
        CFG_THERMOSTATS: [{ ID: '8', WIN: { TM: '21' }, ACT_MODE: 'OFF', ACT_SEA: 'WIN', MAN_HRS: '0' }],
        SCENARIOS: [{ ID: '7', DES: 'Scenario A', CAT: 'CUSTOM' }],
      },
    });

    assert.equal(lares4.thermostats.find((d) => d.id === 8)?.description, 'Termostato');
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

  it('handleChange stores STATUS_OUTPUTS update for unknown device ID without throwing', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);

    assert.doesNotThrow(() => handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [{ ID: '99', STA: 'on', POS: 50 }],
        },
      },
    }));
    const pending = (lares4 as unknown as { _pendingOutputStatuses: Map<number, unknown> })._pendingOutputStatuses;
    assert.equal(pending.has(99), true);
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

  it('emits discovered events once per device and initial sync complete once', async () => {
    const discovered: Lares4DeviceDiscoveredEvent[] = [];
    let syncCompleteCount = 0;
    const discoveredViaOption: Lares4DeviceDiscoveredEvent[] = [];
    let syncViaOptionCount = 0;
    const { lares4 } = createLaresWithStubs({
      onDeviceDiscovered: (event) => discoveredViaOption.push(event),
      onInitialSyncComplete: () => {
        syncViaOptionCount += 1;
      },
    });
    const onDiscoveredUnsub = lares4.onDiscovered((event) => discovered.push(event));
    const onSyncUnsub = lares4.onInitialSyncComplete(() => {
      syncCompleteCount += 1;
    });
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    const payload = {
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
    handleMultiTypes({ message: payload });
    await firstOpen;

    const discoveredKeys = new Set(discovered.map((e) => `${e.device.type}:${e.device.id}`));
    assert.equal(discovered.length, discoveredKeys.size);
    assert.equal(syncCompleteCount, 1);
    assert.equal(discoveredViaOption.length, discovered.length);
    assert.equal(syncViaOptionCount, 1);

    handleMultiTypes({ message: payload });
    assert.equal(discovered.length, discoveredKeys.size);

    onDiscoveredUnsub();
    onSyncUnsub();
  });

  it('clears discovery dedupe cache on close and re-emits discovered events on reconnect', async () => {
    const discovered: Array<string> = [];
    const { lares4 } = createLaresWithStubs();
    lares4.onDiscovered((event) => discovered.push(`${event.device.type}:${event.device.id}`));
    const handleOpen = (lares4 as unknown as { handleOpen: () => Promise<void> }).handleOpen.bind(lares4);
    const handleClose = (lares4 as unknown as { handleClose: () => void }).handleClose.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    const payload = {
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
    handleMultiTypes({ message: payload });
    await firstOpen;
    const firstCount = discovered.length;
    assert.ok(firstCount > 0);

    handleClose();

    const secondOpen = handleOpen();
    handleMultiTypes({ message: payload });
    await secondOpen;

    assert.equal(discovered.length, firstCount * 2);
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

  it('projects STATUS_SYSTEM into public systemStatus and emits onSystemStatus', () => {
    const systemEvents: Array<{ in?: number; out?: number }> = [];
    const { lares4 } = createLaresWithStubs({
      onSystemStatus: (event) => {
        const snap: { in?: number; out?: number } = {};
        for (const t of event.status.temperatures) {
          snap[t.id] = t.value;
        }
        systemEvents.push(snap);
      },
    });
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);
    handleMultiTypes({
      message: {
        STATUS_SYSTEM: [{ ID: '1', TEMP: { IN: '24.5', OUT: '7.2' } }],
      },
    });
    assert.equal(lares4.systemStatus.temperatures.find((t) => t.id === 'in')?.value, 24.5);
    assert.equal(lares4.systemStatus.temperatures.find((t) => t.id === 'out')?.value, 7.2);
    assert.equal(systemEvents.length, 1);
  });

  it('reconciles pending STATUS_OUTPUTS when device baseline arrives later', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [{ ID: '42', STA: 'ON', POS: '66' }],
        },
      },
    });

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '42', CAT: Lares4OutputCategories.LIGHT, DES: 'Late Light' }],
        STATUS_OUTPUTS: [{ ID: '42', STA: 'OFF', POS: '0' }],
      },
    });

    assert.equal(lares4.lights.find((d) => d.id === 42)?.brightness, 66);
    assert.equal(lares4.lights.find((d) => d.id === 42)?.on, true);
  });

  it('does not create switches from pending STATUS_OUTPUTS when baseline output is excluded', () => {
    const { lares4 } = createLaresWithStubs();
    (lares4 as unknown as { _ws: { sender: string } })._ws.sender = 'test-sender';
    const handleChange = (lares4 as unknown as { handleChange: (evt: { message: Record<string, unknown> }) => void }).handleChange.bind(lares4);
    const handleMultiTypes = (lares4 as unknown as { handleMultiTypes: (evt: { message: Record<string, unknown> }) => void }).handleMultiTypes.bind(lares4);

    handleChange({
      message: {
        'test-sender': {
          STATUS_OUTPUTS: [{ ID: '55', STA: 'ON', POS: '0' }],
        },
      },
    });

    handleMultiTypes({
      message: {
        OUTPUTS: [{ ID: '55', CAT: Lares4OutputCategories.LIGHT, DES: 'Allarme Sirena' }],
        STATUS_OUTPUTS: [{ ID: '55', STA: 'OFF', POS: '0' }],
      },
    });

    assert.equal(lares4.switches.find((d) => d.id === 55), undefined);
    assert.equal(lares4.lights.find((d) => d.id === 55)?.on, true);
  });
});
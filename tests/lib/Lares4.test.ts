import { Emitter } from '@mnasyrov/pubsub';
import { Lares4, Lares4Factory, Lares4Info } from '../../src/lib/Lares4';
import { Lares4Socket } from '../../src/lib/Lares4Socket';
import { Lares4DeviceTypes, Lares4CoverStates, Lares4ThermostatActModes, Lares4ThermostatSeasons, ThermostatSeasons, ThermostatActModes } from '../../src/types';

jest.mock('../../src/lib/Lares4Socket');

describe('Lares4', () => {
  let lares4: Lares4;
  let mockSocket: jest.Mocked<Lares4Socket>;
  let mockLares4Info: Lares4Info;

  beforeEach(() => {
    (Lares4Socket as jest.Mock).mockClear();

    mockLares4Info = {
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
        8: { id: 8, type: Lares4DeviceTypes.THERMOSTAT, description: 'Thermostat 1', currentTemperature: 20, targetTemperature: 22, mode: Lares4ThermostatActModes.manual, season: Lares4ThermostatSeasons.winter, manualEnd: 0, enabled: true },
      },
      sensors: {
        9: { id: 9, type: Lares4DeviceTypes.SENSOR, description: 'Sensor 1', sensors: [] },
      },
      zones: {
        10: { id: 10, type: Lares4DeviceTypes.ZONE, description: 'Zone 1', armed: false, bypassed: false, fault: false, open: false },
      },
      last_updated: Date.now(),
    };

    lares4 = new Lares4('test-sender', '123456', '192.168.1.100', true);
    
    mockSocket = (Lares4Socket as jest.Mock).mock.instances[0];
    mockSocket.messages = new Emitter();

    Object.defineProperty(lares4, '_lares4', {
      writable: true,
      value: mockLares4Info,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(lares4).toBeDefined();
  });

  it('should initialize Lares4Socket with correct parameters', () => {
    expect(Lares4Socket).toHaveBeenCalledTimes(1);
    expect(Lares4Socket).toHaveBeenCalledWith(
      'test-sender',
      '123456',
      '192.168.1.100',
      true, // wss
      expect.any(Object), // Lares4Logger instance
      {
        port: 443,
        heartbeat_interval_ms: 30000,
        reconnect_delay_ms: 5000,
      }
    );
  });

  describe('Lares4Factory', () => {
    it('should create a Lares4 instance and call run', async () => {
      const mockRun = jest.spyOn(Lares4.prototype, 'run').mockResolvedValueOnce(undefined);
      const lares4Instance = await Lares4Factory.createLares4('factory-sender', '1234', '192.168.1.1', false);
      expect(lares4Instance).toBeInstanceOf(Lares4);
      expect(mockRun).toHaveBeenCalledTimes(1);
      mockRun.mockRestore();
    });
  });

  describe('Lares4Socket subscription', () => {
    it('should subscribe to Lares4Socket messages emitter when run is called', async () => {
      // Mock the socket's messages emitter
      const mockSubscribe = jest.fn();
      const mockOpen = jest.fn().mockResolvedValue(undefined);
      
      mockSocket.messages = {
        subscribe: mockSubscribe,
      } as any;
      mockSocket.open = mockOpen;

      // Call run which should subscribe to the messages emitter
      await lares4.run();

      // Verify that subscribe was called with a function
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
      
      // Verify that open was called
      expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    it('should handle messages from Lares4Socket emitter through listen method', async () => {
      const mockSubscribe = jest.fn();
      const mockOpen = jest.fn().mockResolvedValue(undefined);
      const listenSpy = jest.spyOn(lares4 as any, 'listen');
      
      let subscribeCallback: any;
      mockSubscribe.mockImplementation((callback) => {
        subscribeCallback = callback;
      });

      mockSocket.messages = {
        subscribe: mockSubscribe,
      } as any;
      mockSocket.open = mockOpen;

      await lares4.run();

      // Simulate receiving a message from the socket
      const testMessage = {
        type: 'OPEN' as any,
        message: 'test message'
      };
      
      subscribeCallback(testMessage);

      // Verify that the listen method was called with the message
      expect(listenSpy).toHaveBeenCalledWith(testMessage);
      
      listenSpy.mockRestore();
    });
  });

  describe('device getters', () => {
    it('should return sorted lights', () => {
      const lights = lares4.lights;
      expect(lights).toEqual([
        mockLares4Info.lights[1],
        mockLares4Info.lights[2],
      ]);
      expect(lights[0].id).toBeLessThan(lights[1].id);
    });

    it('should return sorted covers', () => {
      const covers = lares4.covers;
      expect(covers).toEqual([
        mockLares4Info.covers[3],
        mockLares4Info.covers[4],
      ]);
      expect(covers[0].id).toBeLessThan(covers[1].id);
    });

    it('should return sorted gates', () => {
      const gates = lares4.gates;
      expect(gates).toEqual([
        mockLares4Info.gates[5],
      ]);
    });

    it('should return sorted and filtered scenarios', () => {
      const scenarios = lares4.scenarios;
      expect(scenarios).toEqual([
        mockLares4Info.scenarios[7],
      ]);
      expect(scenarios.some(s => s.category === 'ARM')).toBeFalsy();
    });

    it('should return sorted thermostats', () => {
      const thermostats = lares4.thermostats;
      expect(thermostats).toEqual([
        mockLares4Info.thermostats[8],
      ]);
    });

    it('should return sorted sensors', () => {
      const sensors = lares4.sensors;
      expect(sensors).toEqual([
        mockLares4Info.sensors[9],
      ]);
    });

    it('should return sorted zones', () => {
      const zones = lares4.zones;
      expect(zones).toEqual([
        mockLares4Info.zones[10],
      ]);
    });

    it('should return combined and sorted outputs', () => {
      const outputs = lares4.outputs;
      expect(outputs).toEqual([
        mockLares4Info.lights[1],
        mockLares4Info.lights[2],
        mockLares4Info.covers[3],
        mockLares4Info.covers[4],
        mockLares4Info.gates[5],
      ]);
      expect(outputs[0].id).toBeLessThan(outputs[1].id);
      expect(outputs[1].id).toBeLessThan(outputs[2].id);
    });
  });

  describe('command methods', () => {
    it('setOutput should call _ws.send with correct parameters', () => {
      const id = 1;
      const value = 'ON';
      lares4.setOutput(id, value);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'CMD_USR',
        'CMD_SET_OUTPUT',
        {
          ID_LOGIN: 'true',
          PIN: 'true',
          OUTPUT: {
            ID: `${id}`,
            STA: `${value}`,
          },
        },
      );
    });

    it('triggerScenario should call _ws.send with correct parameters', () => {
      const id = 7;
      lares4.triggerScenario(id);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'CMD_USR',
        'CMD_EXE_SCENARIO',
        {
          ID_LOGIN: 'true',
          PIN: 'true',
          SCENARIO: {
            ID: `${id}`,
          },
        },
      );
    });

    it('setThermostatMode should call _ws.send with correct parameters', () => {
      const id = 8;
      const mode = ThermostatActModes.MANUAL;
      lares4.setThermostatMode(id, mode);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'WRITE_CFG',
        'CFG_ALL',
        {
          ID_LOGIN: 'true',
          CFG_THERMOSTATS: [
            {
              ID: `${id}`,
              ACT_MODE: mode,
              MAN_HRS: '00',
            },
          ],
        },
      );
    });

    it('setThermostatManualEnding should call _ws.send with correct parameters', () => {
      const id = 8;
      const time = '0100';
      lares4.setThermostatManualEnding(id, time);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'WRITE_CFG',
        'CFG_ALL',
        {
          ID_LOGIN: 'true',
          CFG_THERMOSTATS: [
            {
              ID: `${id}`,
              MAN_HRS: time,
            },
          ],
        },
      );
    });

    it('setThermostatSeason should call _ws.send with correct parameters', () => {
      const id = 8;
      const season = ThermostatSeasons.SUM;
      lares4.setThermostatSeason(id, season);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'WRITE_CFG',
        'CFG_ALL',
        {
          ID_LOGIN: 'true',
          CFG_THERMOSTATS: [
            {
              ID: `${id}`,
              ACT_SEA: season,
            },
          ],
        },
      );
    });

    it('setThermostatTarget should call _ws.send with correct parameters', () => {
      const id = 8;
      const season = ThermostatSeasons.WIN;
      const target = 21;
      lares4.setThermostatTarget(id, season, target);
      expect(mockSocket.send).toHaveBeenCalledWith(
        'WRITE_CFG',
        'CFG_ALL',
        {
          ID_LOGIN: 'true',
          CFG_THERMOSTATS: [
            {
              ID: `${id}`,
              [season as string]: {
                TM: `${target}`,
              },
            },
          ],
        },
      );
    });
  });
});
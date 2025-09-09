import WebSocket from 'ws';
import { Lares4Socket } from '../../src/lib/Lares4Socket';
import { Lares4Logger } from '../../src/lib/Lares4Logger';
import { Lares4CommandFactory } from '../../src/lib/Lares4CommandFactory';
import { Lares4SocketEventType, Lares4SocketOptions } from '../../src/types';
import { Agent } from 'https';

jest.mock('ws');
jest.mock('../../src/lib/Lares4Logger');
jest.mock('../../src/lib/Lares4CommandFactory');
jest.mock('https');

const MockWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;
const MockLares4Logger = Lares4Logger as jest.MockedClass<typeof Lares4Logger>;
const MockLares4CommandFactory = Lares4CommandFactory as jest.MockedClass<typeof Lares4CommandFactory>;

describe('Lares4Socket', () => {
  let lares4Socket: Lares4Socket;
  let mockWsInstance: jest.Mocked<WebSocket>;
  let mockLoggerInstance: jest.Mocked<Lares4Logger>;
  let mockCmdFactoryInstance: jest.Mocked<Lares4CommandFactory>;

  const sender = 'test-sender';
  const pin = '1234';
  const ip = '192.168.1.100';
  const options: Lares4SocketOptions = {
    port: 443,
    heartbeat_interval_ms: 30000,
    reconnect_delay_ms: 5000,
  };

  beforeEach(() => {
    jest.useFakeTimers();

    MockWebSocket.mockClear();
    MockLares4Logger.mockClear();
    MockLares4CommandFactory.mockClear();

    mockWsInstance = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      removeAllListeners: jest.fn(),
      listeners: jest.fn(() => []),
    } as unknown as jest.Mocked<WebSocket>;

    mockLoggerInstance = new MockLares4Logger() as jest.Mocked<Lares4Logger>;
    mockCmdFactoryInstance = new MockLares4CommandFactory(sender, pin) as jest.Mocked<Lares4CommandFactory>;
    mockCmdFactoryInstance.build_cmd = jest.fn((cmd, type, payload) => ({
      CMD: cmd,
      PAYLOAD_TYPE: type,
      PAYLOAD: payload,
      SENDER: sender,
      RECEIVER: '',
      ID: '1',
      TIMESTAMP: '123456789',
      CRC_16: '0x0000'
    }));
    (WebSocket as unknown as jest.Mock).mockImplementation(() => mockWsInstance);
    (Lares4CommandFactory as jest.Mock).mockImplementation(() => mockCmdFactoryInstance);

    lares4Socket = new Lares4Socket(sender, pin, ip, true, mockLoggerInstance, options);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should construct and initialize WebSocket correctly', () => {
    expect(WebSocket).toHaveBeenCalledTimes(1);
    expect(WebSocket).toHaveBeenCalledWith(`${ip}/KseniaWsock`, ['KS_WSOCK'], {
      protocol: 'wss',
      port: options.port,
      rejectUnauthorized: false,
      agent: expect.any(Agent),
    });
    expect(Lares4CommandFactory).toHaveBeenCalledWith(sender, pin);
  });

  describe('open', () => {
    it('should register event listeners and await login', async () => {
      const openPromise = lares4Socket.open();
      expect(mockWsInstance.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWsInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWsInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWsInstance.on).toHaveBeenCalledWith('error', expect.any(Function));

      const onOpen = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'open')[1];
      onOpen();
      const onMessage = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'OK' } }));

      await openPromise;
      expect(mockLoggerInstance.debug).toHaveBeenCalledWith('Login successful');
    });
  });

  describe('event handling', () => {
    let onOpen: () => void;
    let onMessage: (data: WebSocket.Data) => void;
    let onClose: () => void;
    let onError: (err: Error) => void;

    beforeEach(async () => {
      lares4Socket.open();
      onOpen = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'open')[1];
      onMessage = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      onClose = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'close')[1];
      onError = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'error')[1];
    });

    it('should handle open event, login, and start heartbeat', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      onOpen();

      expect(mockCmdFactoryInstance.build_cmd).toHaveBeenCalledWith('LOGIN', 'UNKNOWN', { ID_LOGIN: 'true' });
      expect(mockWsInstance.send).toHaveBeenCalledWith(expect.any(String));

      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'OK' } }));

      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.OPEN });
      expect(mockLoggerInstance.debug).toHaveBeenCalledWith('Login successful');

      // check heartbeat
      jest.advanceTimersByTime(options.heartbeat_interval_ms!);
      expect(mockCmdFactoryInstance.build_cmd).toHaveBeenCalledWith('PING', 'HEARTBEAT', { ID_LOGIN: 'true' });
      expect(mockWsInstance.send).toHaveBeenCalledTimes(2); // LOGIN + PING
    });

    it('should handle failed login', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      onOpen();
      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'FAIL' } }));
      expect(messagesSpy).not.toHaveBeenCalledWith({ type: Lares4SocketEventType.OPEN });
      expect(mockLoggerInstance.debug).toHaveBeenCalledWith('Login failed');
      jest.advanceTimersByTime(options.heartbeat_interval_ms!);
      expect(mockCmdFactoryInstance.build_cmd).not.toHaveBeenCalledWith('PING', 'HEARTBEAT', { ID_LOGIN: 'true' });
    });

    it('should handle PONG message', () => {
      onOpen();
      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'OK' } }));
      onMessage(JSON.stringify({ CMD: 'PING' }));
      expect(mockLoggerInstance.debug).toHaveBeenCalledWith('PONG received from Lares4');
    });

    it('should handle CHANGE message', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      const payload = { some: 'change data' };
      onMessage(JSON.stringify({ PAYLOAD_TYPE: 'CHANGES', PAYLOAD: payload }));
      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.CHANGE, message: payload });
    });

    it('should handle MULTI_TYPES message', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      const payload = { some: 'multi_types data' };
      onMessage(JSON.stringify({ PAYLOAD_TYPE: 'MULTI_TYPES', PAYLOAD: payload }));
      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.MULTI_TYPES, message: payload });
    });

    it('should handle close event and attempt to reconnect', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      onClose();

      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.CLOSE });
      expect(mockLoggerInstance.warn).toHaveBeenCalledWith('WebSocket connection closed. Attempting to reconnect...');

      jest.advanceTimersByTime(options.reconnect_delay_ms!);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Attempting to reconnect...');
    });

    it('should handle close event and attempt to reconnect and then login again', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      onClose();

      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.CLOSE });
      expect(mockLoggerInstance.warn).toHaveBeenCalledWith('WebSocket connection closed. Attempting to reconnect...');

      jest.advanceTimersByTime(options.reconnect_delay_ms!);
      expect(mockLoggerInstance.info).toHaveBeenCalledWith('Attempting to reconnect...');

      const onMessage = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'OK' } }));
    });

    it('should handle error event', () => {
      const messagesSpy = jest.spyOn(lares4Socket.messages, 'emit');
      const error = new Error('Test Error');
      onError(error);

      expect(messagesSpy).toHaveBeenCalledWith({ type: Lares4SocketEventType.ERROR, message: error.message });
      expect(mockLoggerInstance.error).toHaveBeenCalledWith(`WebSocket error: ${error.message}`);
    });
  });

  describe('send', () => {
    it('should build and send a command', () => {
      const cmd = 'TEST_CMD';
      const payload_type = 'TEST_TYPE';
      const payload = { data: 'test' };
      lares4Socket.send(cmd, payload_type, payload);

      expect(mockCmdFactoryInstance.build_cmd).toHaveBeenCalledWith(cmd, payload_type, payload);
      expect(mockWsInstance.send).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('close', () => {
    it('should stop heartbeat, clear reconnect interval, and remove listeners', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      
      lares4Socket.open();
      const onOpen = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'open')[1];
      onOpen();
      const onMessage = (mockWsInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      onMessage(JSON.stringify({ CMD: 'LOGIN', PAYLOAD: { RESULT: 'OK' } }));
      
      // Verify that heartbeat was started after successful login
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), options.heartbeat_interval_ms);

      lares4Socket.close();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(mockWsInstance.removeAllListeners).toHaveBeenCalled();
      expect(mockWsInstance.close).toHaveBeenCalledTimes(1);
      
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });
});

import WebSocket from 'ws';

export interface PendingLogin {
  timeout: ReturnType<typeof setTimeout>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface Lares4CoreState {
  ws?: WebSocket;
  isConnected: boolean;
  idLogin?: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  pendingLogin?: PendingLogin;
  reconnectAttempts: number;
  isManualClose: boolean;
  heartbeatPending: boolean;
  lastPongReceived: number;
  hasCompletedInitialSync: boolean;
  thermostatProgramIdByOutputId: Map<string, string>;
  domusSensorIdByThermostatProgramId: Map<string, string>;
  thermostatCfgById: Map<string, Record<string, unknown>>;
  thermostatCommandIdByOutputId: Map<string, string>;
}

export function createInitialCoreState(): Lares4CoreState {
  return {
    isConnected: false,
    reconnectAttempts: 0,
    isManualClose: false,
    heartbeatPending: false,
    lastPongReceived: 0,
    hasCompletedInitialSync: false,
    thermostatProgramIdByOutputId: new Map(),
    domusSensorIdByThermostatProgramId: new Map(),
    thermostatCfgById: new Map(),
    thermostatCommandIdByOutputId: new Map(),
  };
}

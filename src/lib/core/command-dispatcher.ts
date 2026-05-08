import { Lares4CommandTimeoutError } from './errors';

interface PendingCommand {
  timeout: ReturnType<typeof setTimeout>;
  expectedCmds?: Set<string>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface ResponseLike {
  ID: string;
  CMD: string;
}

export class CommandDispatcher {
  private readonly commandQueues = new Map<string, Promise<void>>();
  private readonly pendingCommands = new Map<string, PendingCommand>();

  public enqueuePerDevice(deviceId: string, command: () => Promise<void>): Promise<void> {
    const previous = this.commandQueues.get(deviceId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined) // prior command failure must not block the queue
      .then(command)
      .finally(() => {
        if (this.commandQueues.get(deviceId) === current) {
          this.commandQueues.delete(deviceId);
        }
      });
    this.commandQueues.set(deviceId, current);
    return current;
  }

  public registerPending(commandId: string, timeoutMs: number, expectedCmds?: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Lares4CommandTimeoutError(`Command ${commandId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(commandId, {
        timeout,
        resolve: () => {
          clearTimeout(timeout);
          this.pendingCommands.delete(commandId);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingCommands.delete(commandId);
          reject(error);
        },
        expectedCmds: expectedCmds && expectedCmds.length > 0 ? new Set(expectedCmds) : undefined,
      });
    });
  }

  public resolvePending(message: ResponseLike): void {
    const direct = this.pendingCommands.get(message.ID);
    if (direct) {
      if (direct.expectedCmds && !direct.expectedCmds.has(message.CMD)) {
        return;
      }
      direct.resolve();
      return;
    }

    const candidates: PendingCommand[] = [];
    for (const pending of this.pendingCommands.values()) {
      if (pending.expectedCmds && !pending.expectedCmds.has(message.CMD)) {
        continue;
      }
      candidates.push(pending);
    }

    if (candidates.length === 1) {
      candidates[0].resolve();
    }
  }

  public clearPending(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingCommands.delete(commandId);
  }

  public rejectAll(error: Error): void {
    for (const pending of this.pendingCommands.values()) {
      pending.reject(error);
    }
    this.pendingCommands.clear();
  }

  public clearQueues(): void {
    this.commandQueues.clear();
  }
}

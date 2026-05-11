import { LogLevelEnum, type GenericLogger } from '../../types';

export { LogLevelEnum, type GenericLogger };

export class Lares4Logger {
  private _logger: GenericLogger;
  private _level: string;
  private readonly _nativeConsole = globalThis.console;

  public get level(): string {
    return this._level;
  }

  public set level(level: string) {
    const valid = Object.values(LogLevelEnum) as string[];
    if (!valid.includes(level.toLowerCase())) {
      this._nativeConsole.warn(`Lares4Logger: unknown log level "${level}", defaulting to INFO`);
      this._level = LogLevelEnum.INFO;
    } else {
      this._level = level;
    }
    this.applyLoggerLevel(this._level);
  }

  constructor(externalLogger?: GenericLogger, level: LogLevelEnum = LogLevelEnum.INFO) {
    this._level = level;
    if (externalLogger) {
      this._logger = externalLogger as unknown as GenericLogger;
    } else {
      this._logger = {
        info: (message: string) => this._nativeConsole.info(message),
        warn: (message: string) => this._nativeConsole.warn(message),
        error: (message: string) => this._nativeConsole.error(message),
        debug: (message: string) => this._nativeConsole.debug(message),
      };
    }
    this.applyLoggerLevel(level);
  }

  private applyLoggerLevel(level: string): void {
    const loggerWithLevel = this._logger as GenericLogger & { level?: string };
    if ('level' in loggerWithLevel) {
      loggerWithLevel.level = level;
    }
  }

  public info(message: string): void {
    if (this.shouldLog(LogLevelEnum.INFO)) {
      this._logger.info(message);
    }
  }

  public error(message: string): void {
    if (this.shouldLog(LogLevelEnum.ERROR)) {
      this._logger.error(message);
    }
  }

  public warn(message: string): void {
    if (this.shouldLog(LogLevelEnum.WARN)) {
      this._logger.warn(message);
    }
  }

  public debug(message: string): void {
    if (this.shouldLog(LogLevelEnum.DEBUG)) {
      this._logger.debug(message);
    }
  }

  private shouldLog(level: LogLevelEnum): boolean {
    const rank: Record<LogLevelEnum, number> = {
      [LogLevelEnum.ERROR]: 0,
      [LogLevelEnum.WARN]: 1,
      [LogLevelEnum.INFO]: 2,
      [LogLevelEnum.DEBUG]: 3,
    };
    const current = (this._level.toLowerCase() as LogLevelEnum) || LogLevelEnum.INFO;
    return rank[level] <= (rank[current] ?? rank[LogLevelEnum.INFO]);
  }
}

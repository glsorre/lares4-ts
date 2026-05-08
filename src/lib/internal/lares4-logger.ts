import winston from 'winston';
import { LogLevelEnum, type GenericLogger } from '../../types';

export { LogLevelEnum, type GenericLogger };

export class Lares4Logger {
  private _logger: GenericLogger;
  private _level: string;

  public get level(): string {
    return this._level;
  }

  public set level(level: string) {
    this._level = level;
    this.applyLoggerLevel(level);
  }

  constructor(externalLogger?: GenericLogger, level: LogLevelEnum = LogLevelEnum.INFO) {
    this._level = level;
    if (externalLogger) {
      this._logger = externalLogger as unknown as GenericLogger;
    } else {
      this._logger = winston.createLogger({
        level,
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
            ),
          }),
        ],
      }) as unknown as GenericLogger;
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
    this._logger.info(message);
  }

  public error(message: string): void {
    this._logger.error(message);
  }

  public warn(message: string): void {
    this._logger.warn(message);
  }

  public debug(message: string): void {
    this._logger.debug(message);
  }
}

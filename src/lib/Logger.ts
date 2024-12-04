import winston from 'winston';

export interface GenericLogger {
  info: (message: string) => (void | winston.LogMethod);
  error: (message: string) => (void | winston.LogMethod);
  warn: (message: string) => (void | winston.LogMethod);
  debug: (message: string) => (void | winston.LogMethod);
}

export class Lares4Logger {
  private _logger: GenericLogger;
  private _level: string = process.env.LOG_LEVEL || 'info';

  public get get_level(): string {
    return this._level;
  }

  public set set_level(level: string) {
    this._level = level;
  }

  constructor(externalLogger?: GenericLogger) {
    if (externalLogger) {
      this._logger = externalLogger as unknown as GenericLogger;
    } else {
      this._logger = winston.createLogger({
        level: this._level,
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
  }

  public log(message: string): void {
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
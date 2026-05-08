export class Lares4Error extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'Lares4Error';
  }
}

export class Lares4ConnectionError extends Lares4Error {
  constructor(message: string) {
    super(message, 'connection_error');
    this.name = 'Lares4ConnectionError';
  }
}

export class Lares4CommandTimeoutError extends Lares4Error {
  constructor(message: string) {
    super(message, 'command_timeout');
    this.name = 'Lares4CommandTimeoutError';
  }
}

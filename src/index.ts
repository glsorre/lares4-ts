import { Lares4Factory, Lares4, type Lares4Options, type Lares4Info } from './lib/public/lares4';
import {
  Lares4Error,
  Lares4ConnectionError,
  Lares4CommandTimeoutError,
} from './lib/core/errors';
import { LogLevelEnum, type GenericLogger } from './types';

export * from './public-types';

export type { GenericLogger, Lares4Options, Lares4Info };
export {
  Lares4Factory,
  Lares4,
  Lares4Error,
  Lares4ConnectionError,
  Lares4CommandTimeoutError,
  LogLevelEnum,
};

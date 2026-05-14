# lares4-ts

Per l'Italiano, guarda [README.it.md](./README.it.md)

TypeScript library for connecting to Ksenia Lares 4 and managing home automation entities (lights, covers, sensors, thermostats, zones, scenarios, gates).

## Install

Requirements:
- Node.js `>=22`

Install:

```bash
npm install lares4-ts
```

## Quick Start

```ts
import { Lares4Factory } from 'lares4-ts';

const lares = await Lares4Factory.createLares4(
  'MY_SENDER',
  '192.168.1.XXX',
  '123456',
  true,
);

// Read discovered entities
console.log(lares.lights);
console.log(lares.covers);
console.log(lares.thermostats);

// Control entities
lares.switchOn(1);
lares.rollTo(12, 50);
lares.triggerScenario(3);
```

## Runtime Configuration (Node + Browser)

The library now supports runtime-agnostic websocket/logger configuration.

`Lares4Options` accepts:
- `logger` (preferred): custom logger implementing `info|warn|error|debug`
- `wsFactory`: custom websocket factory
- `wsOptions`: extra options forwarded to `wsFactory`

### Browser example

```ts
import { Lares4 } from 'lares4-ts';

const lares = new Lares4('MY_SENDER', '123456', '192.168.1.100', true, {
  logger: console,
  wsFactory: (url, protocols) => new WebSocket(url, protocols),
});
```

### Node example with custom `ws` factory

```ts
import WebSocket from 'ws';
import { Lares4 } from 'lares4-ts';

const lares = new Lares4('MY_SENDER', '123456', '192.168.1.100', true, {
  logger: console,
  wsFactory: (url, protocols, options) => new WebSocket(url, protocols, options),
  wsOptions: {
    rejectUnauthorized: false,
  },
});
```

## Observability

Subscribe to outgoing frames after they have been acknowledged by the websocket.

```ts
const unsubscribe = lares.onSent(({ raw, command }) => {
  console.log('->', command.CMD, command.PAYLOAD_TYPE, raw);
});

// later
unsubscribe();
```

## Public API

Main runtime exports:
- `Lares4`
- `Lares4Factory`

Runtime errors:
- `Lares4Error`
- `Lares4ConnectionError`
- `Lares4CommandTimeoutError`

Public types/enums (from package root):
- Device/entity models such as `Lares4Light`, `Lares4Cover`, `Lares4Thermostat`, `Lares4Sensor`, `Lares4Zone`, `Lares4Scenario`, `Lares4Gate`
- Event payloads: `Lares4DeviceUpdateEvent`, `Lares4DeviceDiscoveredEvent`, `Lares4SystemStatusEvent`, `Lares4SentEvent`
- Compatibility types: `Lares4ErrorLike`, `ProgramThermostat`, `SystemStatus`
- Enums such as `Lares4DeviceTypes`, `Lares4SensorTypes`, `Lares4CoverStates`, `Lares4ThermostatActModes`, `Lares4ThermostatSeasons`

Unsupported API surface:
- Deep imports into internal paths (`dist/lib/...`, `src/...`) are not public contract and may change without notice.

## Development

```bash
npm run lint
npm run build
npm test
```

## Credits

Thanks to @gvisconti1983 for Ksenia CRC functions used as reference from [lares-hass](https://github.com/gvisconti1983/lares-hass).

## Disclaimer

This project and its author are not affiliated with Ksenia Security S.p.A. or related entities.

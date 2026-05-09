# lares4-ts

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

Notes:
- Use package-root imports only (`lares4-ts`).
- This library targets home automation entities, not alarm arming/disarming workflows.

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

# lares4-ts

Libreria TypeScript per connettersi a Ksenia Lares 4 e gestire le entità di domotica (luci, tapparelle, sensori, termostati, zone, scenari, cancelli).

## Installazione

Requisiti:
- Node.js `>=22`

Installazione:

```bash
npm install lares4-ts
```

## Guida rapida

```ts
import { Lares4Factory } from 'lares4-ts';

const lares = await Lares4Factory.createLares4(
  'MY_SENDER',
  '192.168.1.XXX',
  '123456',
  true,
);

// Leggi le entità rilevate
console.log(lares.lights);
console.log(lares.covers);
console.log(lares.thermostats);

// Comanda le entità
lares.switchOn(1);
lares.rollTo(12, 50);
lares.triggerScenario(3);
```

Note:
- Usa solo import dalla radice del pacchetto (`lares4-ts`).
- Questa libreria è orientata alle entità di domotica, non ai flussi di inserimento/disinserimento dell'allarme.

## API pubblica

Esportazioni principali a runtime:
- `Lares4`
- `Lares4Factory`

Errori a runtime:
- `Lares4Error`
- `Lares4ConnectionError`
- `Lares4CommandTimeoutError`

Tipi ed enumerazioni pubblici (dalla radice del pacchetto):
- Modelli di dispositivo/entità come `Lares4Light`, `Lares4Cover`, `Lares4Thermostat`, `Lares4Sensor`, `Lares4Zone`, `Lares4Scenario`, `Lares4Gate`
- Tipi di compatibilità: `Lares4ErrorLike`, `ProgramThermostat`, `SystemStatus`
- Enumerazioni come `Lares4DeviceTypes`, `Lares4SensorTypes`, `Lares4CoverStates`, `Lares4ThermostatActModes`, `Lares4ThermostatSeasons`

Superficie API non supportata:
- Import profondi verso percorsi interni (`dist/lib/...`, `src/...`) non costituiscono contratto pubblico e possono cambiare senza preavviso.

## Sviluppo

```bash
npm run lint
npm run build
npm test
```

## Ringraziamenti

Grazie a @gvisconti1983 per le funzioni CRC Ksenia usate come riferimento da [lares-hass](https://github.com/gvisconti1983/lares-hass).

## Disclaimer

Questo progetto e il suo autore non sono affiliati con Ksenia Security S.p.A. o soggetti collegati.

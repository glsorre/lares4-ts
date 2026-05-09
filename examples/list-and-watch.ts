import { Lares4Factory, Lares4DeviceTypes } from '../src/index.ts';

const ip = process.env.LARES4_IP;
const pin = process.env.LARES4_PIN;
const sender = process.env.LARES4_SENDER ?? 'example';
const wss = process.env.LARES4_WSS !== 'false';

if (!ip || !pin) {
  console.error('Missing required env vars: LARES4_IP, LARES4_PIN');
  process.exit(1);
}

const lares = await Lares4Factory.createLares4(sender, ip, pin, wss);

console.log('\n=== Lares4 Peripherals ===\n');

console.log(`Lights (${lares.lights.length}):`);
for (const d of lares.lights) {
  console.log(`  [${d.id}] ${d.description} — on=${d.on} brightness=${d.brightness}`);
}

console.log(`\nCovers (${lares.covers.length}):`);
for (const d of lares.covers) {
  console.log(`  [${d.id}] ${d.description} — position=${d.position} state=${d.state}`);
}

console.log(`\nGates (${lares.gates.length}):`);
for (const d of lares.gates) {
  console.log(`  [${d.id}] ${d.description} — on=${d.on}`);
}

console.log(`\nSwitches (${lares.switches.length}):`);
for (const d of lares.switches) {
  console.log(`  [${d.id}] ${d.description} — on=${d.on}`);
}

console.log(`\nThermostats (${lares.thermostats.length}):`);
for (const d of lares.thermostats) {
  console.log(`  [${d.id}] ${d.description} — current=${d.currentTemperature} target=${d.targetTemperature} mode=${d.mode}`);
}

console.log(`\nSensors (${lares.sensors.length}):`);
for (const d of lares.sensors) {
  const readings = d.sensors.map((s) => `${s.type}=${s.value}${s.unit ?? ''}`).join(' ');
  console.log(`  [${d.id}] ${d.description} — ${readings}`);
}

console.log(`\nZones (${lares.zones.length}):`);
for (const d of lares.zones) {
  console.log(`  [${d.id}] ${d.description} — armed=${d.armed} open=${d.open} fault=${d.fault} bypassed=${d.bypassed}`);
}

console.log(`\nScenarios (${lares.scenarios.length}):`);
for (const d of lares.scenarios) {
  console.log(`  [${d.id}] ${d.description}`);
}

console.log('\n=== Watching for updates (Ctrl+C to stop) ===\n');

const unsubscribe = lares.onUpdate((event) => {
  const { type, device } = event;
  switch (type) {
  case Lares4DeviceTypes.LIGHT:
    console.log(`[LIGHT]     [${device.id}] ${device.description} — on=${device.on} brightness=${device.brightness}`);
    break;
  case Lares4DeviceTypes.COVER:
    console.log(`[COVER]     [${device.id}] ${device.description} — position=${device.position} state=${device.state}`);
    break;
  case Lares4DeviceTypes.GATE:
    console.log(`[GATE]      [${device.id}] ${device.description} — on=${device.on}`);
    break;
  case Lares4DeviceTypes.SWITCH:
    console.log(`[SWITCH]    [${device.id}] ${device.description} — on=${device.on}`);
    break;
  case Lares4DeviceTypes.THERMOSTAT:
    console.log(`[THERMO]    [${device.id}] ${device.description} — current=${device.currentTemperature} target=${device.targetTemperature}`);
    break;
  case Lares4DeviceTypes.SENSOR:
    console.log(`[SENSOR]    [${device.id}] ${device.description} — ${device.sensors.map((s) => `${s.type}=${s.value}${s.unit ?? ''}`).join(' ')}`);
    break;
  case Lares4DeviceTypes.ZONE:
    console.log(`[ZONE]      [${device.id}] ${device.description} — armed=${device.armed} open=${device.open} fault=${device.fault}`);
    break;
  case Lares4DeviceTypes.SCENARIO:
    console.log(`[SCENARIO]  [${device.id}] ${device.description}`);
    break;
  }
});

process.on('SIGINT', () => {
  unsubscribe();
  lares.close();
  process.exit(0);
});

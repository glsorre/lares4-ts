import { Lares4Factory } from '../src';

const lares4 = await Lares4Factory.createLares4(
  'sender',
  'ip',
  'pin',
);

lares4.outputs_status_emitter.subscribe((data) => {
  console.dir(data, { depth: null });
});

lares4.sensors_status_emitter.subscribe((data) => {
  console.dir(data, { depth: null });
});

lares4.temperatures_status_emitter.subscribe((data) => {
  console.dir(data, { depth: null });
});

process.on('SIGINT', () => {
  console.log('Exiting...');
  lares4.logout();
  process.exit();
});
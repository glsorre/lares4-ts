import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Lares4CommandFactory } from '../../../src/lib/internal/lares4-command-factory';

describe('Lares4CommandFactory', () => {
  it('increments command ids for each built command', () => {
    const factory = new Lares4CommandFactory('sender', '1234');
    const first = factory.build_cmd('READ', 'MULTI_TYPES', {});
    const second = factory.build_cmd('READ', 'MULTI_TYPES', {});

    assert.equal(first.ID, '1');
    assert.equal(second.ID, '2');
  });

  it('substitutes runtime login id and pin placeholders in payload', () => {
    const factory = new Lares4CommandFactory('sender', '1234');
    factory.set_login_id = '77';
    const command = factory.build_cmd('LOGIN', 'AUTH', {
      ID_LOGIN: 'true',
      PIN: 'true',
    });

    assert.equal(command.PAYLOAD.ID_LOGIN, '77');
    assert.equal(command.PAYLOAD.PIN, '1234');
  });

  it('produces deterministic CRC for same input and timestamp', () => {
    const factoryA = new Lares4CommandFactory('sender', '1234');
    const factoryB = new Lares4CommandFactory('sender', '1234');
    const originalNow = Date.now;
    Date.now = () => 1710000000000;
    try {
      const a = factoryA.build_cmd('READ', 'MULTI_TYPES', { ID_LOGIN: 'true' });
      const b = factoryB.build_cmd('READ', 'MULTI_TYPES', { ID_LOGIN: 'true' });

      assert.equal(a.CRC_16, b.CRC_16);
      assert.match(a.CRC_16, /^0x[0-9A-F]{4}$/);
    } finally {
      Date.now = originalNow;
    }
  });
});

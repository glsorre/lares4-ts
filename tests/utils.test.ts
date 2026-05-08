import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Deferred } from '../src/utils/index';

describe('Deferred', () => {
  it('resolves with the given value', async () => {
    const d = new Deferred<number>();
    d.resolve(42);
    assert.equal(await d.promise, 42);
  });

  it('rejects with the given reason', async () => {
    const d = new Deferred<number>();
    d.reject(new Error('failure'));
    await assert.rejects(d.promise, /failure/);
  });

  it('promise settles once and does not change after resolve', async () => {
    const d = new Deferred<string>();
    d.resolve('first');
    d.resolve('second');
    assert.equal(await d.promise, 'first');
  });

  it('resolve and reject are no-ops before constructor assigns them', async () => {
    const d = new Deferred<void>();
    d.resolve();
    await d.promise;
  });
});

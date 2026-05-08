import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TypedEmitter } from '../../../src/lib/core/typed-emitter';

describe('TypedEmitter', () => {
  it('emits events to subscribers', () => {
    const emitter = new TypedEmitter<{ type: string; value: number }>();
    const values: number[] = [];

    emitter.subscribe((event) => {
      values.push(event.value);
    });

    emitter.emit({ type: 'VALUE', value: 1 });
    emitter.emit({ type: 'VALUE', value: 2 });

    assert.deepEqual(values, [1, 2]);
  });

  it('unsubscribes listeners', () => {
    const emitter = new TypedEmitter<{ type: string }>();
    let count = 0;

    const unsubscribe = emitter.subscribe(() => {
      count += 1;
    });

    emitter.emit({ type: 'VALUE' });
    unsubscribe();
    emitter.emit({ type: 'VALUE' });

    assert.equal(count, 1);
  });
});

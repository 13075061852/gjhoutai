import { describe, expect, it } from 'vitest';
import { createTaskQueue } from './taskQueue';

describe('request task queue', () => {
  it('limits concurrency, retains order and releases slots after errors', async () => {
    const queue = createTaskQueue(2);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => queue(async () => {
      active++; peak = Math.max(peak, active); started.push(i);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      if (i === 2) throw new Error('failed');
      return i;
    })));
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(results[2].status).toBe('rejected');
    expect(results[7]).toEqual({ status: 'fulfilled', value: 7 });
    expect(await queue(async () => 9)).toBe(9);
  });

  it('rejects invalid limits', () => {
    for (const limit of [0, -1, NaN, 1.5]) expect(() => createTaskQueue(limit)).toThrow(RangeError);
  });
});

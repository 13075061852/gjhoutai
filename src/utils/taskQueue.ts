/** Limit expensive background requests without blocking the browser's UI thread. */
export function createTaskQueue(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid concurrency');
  let active = 0;
  const waiting: Array<() => void> = [];
  return <T>(task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      void Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active -= 1;
        waiting.shift()?.();
      });
    };
    if (active < concurrency) run();
    else waiting.push(run);
  });
}

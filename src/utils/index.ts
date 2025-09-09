export function debounceWithLock<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number,
): (lockDuration: number, ...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecutionTime = 0;

  return (lockDuration: number, ...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecutionTime < lockDuration) {
      return;
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
      lastExecutionTime = Date.now();
      timeoutId = null;
    }, delay);
  };
}

export class Deferred {
  promise: Promise<unknown>;
  reject: () => void = () => {};
  resolve: (value: unknown) => void = () => {};

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export class Deferred<T = unknown> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void = () => {};
  resolve: (value: T | PromiseLike<T>) => void = () => {};

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

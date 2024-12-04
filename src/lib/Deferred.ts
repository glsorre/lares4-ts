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
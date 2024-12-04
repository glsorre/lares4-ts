export class Deferred {
  promise: Promise<any>;
  reject: () => void = () => {};
  resolve: (value: any) => void = () => {};

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
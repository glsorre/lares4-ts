export type TypedListener<TEvent> = (event: TEvent) => void;

export class TypedEmitter<TEvent> {
  private readonly listeners = new Set<TypedListener<TEvent>>();

  public subscribe(listener: TypedListener<TEvent>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: TEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // isolate per-listener errors so subsequent listeners still fire
      }
    }
  }
}

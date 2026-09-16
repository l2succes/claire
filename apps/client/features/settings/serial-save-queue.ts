export function createSerialSaveQueue<T>(save: (value: T) => Promise<void>) {
  let tail = Promise.resolve();

  return (value: T) => {
    const next = tail.catch(() => undefined).then(() => save(value));
    tail = next;
    return next;
  };
}

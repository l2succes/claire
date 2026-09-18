// A dependency-free signal so API failures can wake the app-wide recovery loop.
const listeners = new Set<() => void>();
export function requestConnectionRecovery() { listeners.forEach((listener) => listener()); }
export function onConnectionRecovery(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

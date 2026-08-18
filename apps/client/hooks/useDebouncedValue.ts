import { useEffect, useState } from 'react';

/**
 * Holds a rapidly changing value until the user pauses. Use it for server
 * filtering so typing a name does not turn into one request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

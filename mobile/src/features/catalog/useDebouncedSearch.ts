import { useEffect, useState } from 'react';

export function useDebouncedSearch(value: string, delayMs = 300): string {
  const normalized = value.trim();
  const [debounced, setDebounced] = useState(normalized);

  useEffect(() => {
    if (delayMs <= 0) {
      return;
    }
    if (!normalized) {
      setDebounced((current) => current ? '' : current);
      return;
    }
    const timer = setTimeout(() => setDebounced(normalized), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, normalized]);

  return delayMs <= 0 ? normalized : debounced;
}

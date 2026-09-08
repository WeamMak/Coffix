import { useEffect, useState } from 'react';

export function useDebouncedSearch(value: string, delayMs = 300): string {
  const normalized = value.trim();
  const [debounced, setDebounced] = useState(normalized);

  if (!normalized && debounced) setDebounced('');

  useEffect(() => {
    if (delayMs <= 0) {
      return;
    }
    if (!normalized) {
      return;
    }
    const timer = setTimeout(() => setDebounced(normalized), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, normalized]);

  return delayMs <= 0 ? normalized : debounced;
}

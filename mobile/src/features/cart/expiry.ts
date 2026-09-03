import { useEffect, useRef, useState } from 'react';

export function remainingSeconds(expiresAt: string, now = Date.now()): number {
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) {
    return 0;
  }
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

export function formatRemaining(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toString()
    .padStart(2, '0')}`;
}

export function useCartExpiry(
  expiresAt: string | null,
  onExpired: () => void,
): number {
  const [seconds, setSeconds] = useState(() => (
    expiresAt ? remainingSeconds(expiresAt) : 0
  ));
  const callbackRef = useRef(onExpired);
  const expiredRef = useRef(false);
  callbackRef.current = onExpired;

  useEffect(() => {
    expiredRef.current = false;
    if (!expiresAt) {
      setSeconds(0);
      return undefined;
    }

    const tick = () => {
      const next = remainingSeconds(expiresAt);
      setSeconds(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        callbackRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return seconds;
}

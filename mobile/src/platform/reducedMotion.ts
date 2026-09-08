import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// Stay still until the OS preference has loaded. One native listener is shared
// by buttons and stacks, and is removed when the last consumer unmounts.
let reduced = true;
const listeners = new Set<() => void>();
let remove: (() => void) | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    let active = true;
    let changed = false;
    const update = (value: boolean) => { reduced = value; listeners.forEach(notify => notify()); };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; update(value); });
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(value => {
      if (active && !changed) update(value ?? false);
    }).catch(() => {});
    remove = () => { active = false; subscription.remove(); };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { remove?.(); remove = undefined; reduced = true; }
  };
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => reduced, () => true);
}

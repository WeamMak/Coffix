import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { secureTokenStore } from '../auth/store';
import { emptyDraft, intakeStore, type IntakeDraft } from './intakeStore';

export function useIntakeDraft(scope: string, machineId: string) {
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(machineId));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const latest = useRef(draft);
  const loadVersion = useRef(0);
  const reload = useCallback(() => {
    const version = ++loadVersion.current;
    setReady(false);
    void intakeStore.load(scope, machineId).then(value => {
      if (active.current && loadVersion.current === version) {
        latest.current = value; setDraft(value); setReady(true); setError('');
      }
    }).catch(() => { if (active.current) setError('לא הצלחנו לקרוא את הטיוטה. יש לפתוח מחדש את הבקשה.'); });
  }, [scope, machineId]);
  useFocusEffect(reload);
  useEffect(() => {
    active.current = true;
    const unsubscribe = secureTokenStore.subscribeToClear(() => { active.current = false; });
    reload();
    return () => { active.current = false; unsubscribe(); };
  }, [reload]);
  const update = async (changes: Partial<IntakeDraft>) => {
    if (!active.current) return;
    loadVersion.current += 1;
    const next = { ...latest.current, ...changes };
    latest.current = next; setDraft(next);
    try { await intakeStore.save(scope, next); if (active.current) setError(''); }
    catch (err) { if (active.current) setError('לא הצלחנו לשמור את הטיוטה. נסו שוב.'); throw err; }
  };
  return { draft, ready, error, update, active };
}

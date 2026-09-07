import * as SecureStore from 'expo-secure-store';

import { toAddressCreate, validateAddressForm, emptyAddressForm, type AddressForm } from '../addresses/form';
import type { ServiceCreate } from './api';

export type DraftMedia = { id: string; uri: string; contentType: string };
export type IntakeDraft = {
  machineId: string;
  collectionId: string;
  serviceTypeId: string;
  description: string;
  urgencyId: string;
  locationMode: 'bring_in' | 'pickup';
  addressId: string;
  address: AddressForm;
  preferredStart: string;
  preferredEnd: string;
  media: DraftMedia[];
  // Persisted before POST: a lost response must never lead to an automatic retry.
  submission: { existingIds: string[]; input: ServiceCreate } | null;
};

export function emptyDraft(machineId: string): IntakeDraft {
  return {
    machineId, collectionId: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }), serviceTypeId: '', description: '', locationMode: 'bring_in',
    addressId: '', address: { ...emptyAddressForm }, preferredStart: '', preferredEnd: '',
    media: [], submission: null, urgencyId: '',
  };
}

export function intakeInput(draft: IntakeDraft, supportedIds: string[], maxFiles = 5): ServiceCreate {
  if (!supportedIds.includes(draft.serviceTypeId)) throw new Error('יש לבחור סוג שירות זמין למכונה.');
  const description = draft.description.trim();
  if (description.length < 10 || description.length > 4000) throw new Error('יש להזין תיאור באורך 10–4000 תווים.');
  if (draft.media.length > Math.min(5, maxFiles)) throw new Error(`ניתן לצרף עד ${Math.min(5, maxFiles)} קבצים.`);
  const input: ServiceCreate = {
    urgency_id: draft.urgencyId || 'normal', service_type_id: draft.serviceTypeId, description, location_mode: draft.locationMode,
    media_ids: [...new Set(draft.media.map(item => item.id))],
  };
  if (draft.locationMode === 'pickup') {
    if (draft.addressId) input.address_id = draft.addressId;
    else {
      if (Object.keys(validateAddressForm(draft.address)).length) throw new Error('יש להזין כתובת איסוף ישראלית מלאה וטלפון תקין.');
      const { is_default: _isDefault, ...address } = toAddressCreate(draft.address);
      input.address = address;
    }
  }
  if (draft.preferredStart || draft.preferredEnd) {
    const start = new Date(draft.preferredStart);
    const end = new Date(draft.preferredEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error('יש לבחור התחלה וסיום תקינים למועד המועדף.');
    }
    input.preferred_window = { start: start.toISOString(), end: end.toISOString() };
  }
  return input;
}

// Small chunks keep Hebrew descriptions below SecureStore's per-item size limit.
// Serialize storage operations so a slow save cannot restore a cleared draft.
export function createIntakeStore() {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const registryKey = 'coffix.serviceDrafts.v1';
  const keyFor = (scope: string, machineId: string) => `${registryKey}.${encodeURIComponent(scope).replace(/%/g, '_')}.${encodeURIComponent(machineId).replace(/%/g, '_')}`;
  const registry = async (): Promise<string[]> => JSON.parse(await SecureStore.getItemAsync(registryKey) ?? '[]');
  const remove = async (key: string) => {
    const count = Number(await SecureStore.getItemAsync(key) ?? 0);
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(key);
  };
  return {
    load: (scope: string, machineId: string) => serialize(async (): Promise<IntakeDraft> => {
      const key = keyFor(scope, machineId);
      const count = Number(await SecureStore.getItemAsync(key) ?? 0);
      if (!count) return emptyDraft(machineId);
      let json = '';
      for (let i = 0; i < count; i += 1) json += await SecureStore.getItemAsync(`${key}.${i}`) ?? '';
      const draft: IntakeDraft = JSON.parse(json);
      if (draft.machineId !== machineId) throw new Error('Invalid service draft');
      return { ...emptyDraft(machineId), ...draft };
    }),
    save: (scope: string, draft: IntakeDraft) => {
      const json = JSON.stringify(draft);
      return serialize(async () => {
        const key = keyFor(scope, draft.machineId);
        const keys = await registry();
        if (!keys.includes(key)) await SecureStore.setItemAsync(registryKey, JSON.stringify([...keys, key]));
        const count = Math.ceil(json.length / 400);
        const oldCount = Number(await SecureStore.getItemAsync(key) ?? 0);
        // Record all potentially written chunks first so logout can remove a
        // partially completed write, including leftovers from a larger draft.
        await SecureStore.setItemAsync(key, String(Math.max(count, oldCount)));
        for (let i = 0; i < count; i += 1) {
          await SecureStore.setItemAsync(`${key}.${i}`, json.slice(i * 400, (i + 1) * 400));
        }
        for (let i = count; i < oldCount; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
        await SecureStore.setItemAsync(key, String(count));
      });
    },
    clear: (scope: string, machineId: string) => serialize(async () => {
      const key = keyFor(scope, machineId);
      await remove(key);
      await SecureStore.setItemAsync(registryKey, JSON.stringify((await registry()).filter(item => item !== key)));
    }),
    clearAll: () => serialize(async () => {
      for (const key of await registry()) await remove(key);
      await SecureStore.deleteItemAsync(registryKey);
    }),
  };
}

export const intakeStore = createIntakeStore();

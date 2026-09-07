import * as SecureStore from 'expo-secure-store';
import { createIntakeStore, emptyDraft, intakeInput } from '../../src/features/service/intakeStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

it('persists a machine draft, isolates other machines and accounts, and clears after submission', async () => {
  const disk = new Map<string, string>();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => disk.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { disk.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { disk.delete(key); });
  const store = createIntakeStore();
  const draft = { ...emptyDraft('machine-1'), description: 'המכונה לא מתחממת' };
  await store.save('account-1', draft);
  expect((await createIntakeStore().load('account-1', 'machine-1')).description).toBe('המכונה לא מתחממת');
  expect((await store.load('account-1', 'machine-2')).description).toBe('');
  expect((await store.load('account-2', 'machine-1')).description).toBe('');
  await store.clear('account-1', 'machine-1');
  expect((await store.load('account-1', 'machine-1')).description).toBe('');
});

it('requires a supported type and 10–4000 characters and at most five completed media', () => {
  const draft = emptyDraft('machine-1');
  expect(() => intakeInput(draft, ['repair'])).toThrow('סוג שירות');
  draft.serviceTypeId = 'repair';
  expect(() => intakeInput(draft, ['repair'])).toThrow('10');
  draft.description = 'המכונה לא מתחממת';
  expect(intakeInput(draft, ['repair'])).toMatchObject({ location_mode: 'bring_in', description: draft.description });
  draft.media = Array.from({ length: 6 }, (_, i) => ({ id: String(i), uri: 'file:///photo', contentType: 'image/jpeg' }));
  expect(() => intakeInput(draft, ['repair'])).toThrow('5');
});

it('requires pickup address and omits it for bring-in, retaining requested window semantics', () => {
  const draft = { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' };
  draft.locationMode = 'pickup';
  expect(() => intakeInput(draft, ['repair'])).toThrow('כתובת');
  draft.addressId = 'saved-address';
  expect(intakeInput(draft, ['repair'])).toMatchObject({ address_id: 'saved-address' });
  draft.locationMode = 'bring_in';
  expect(intakeInput(draft, ['repair'])).not.toHaveProperty('address_id');
  draft.preferredStart = '2026-09-10T08:00:00Z';
  expect(() => intakeInput(draft, ['repair'])).toThrow('מועד');
  draft.preferredEnd = '2026-09-10T10:00:00Z';
  expect(intakeInput(draft, ['repair']).preferred_window).toEqual({ start: '2026-09-10T08:00:00.000Z', end: '2026-09-10T10:00:00.000Z' });
});

it('validates and normalizes an inline Israeli pickup address without saving it to the account', () => {
  const draft = { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת', locationMode: 'pickup' as const };
  draft.address = { ...draft.address, recipientName: 'לקוח', phone: '0501234567', street: 'הרצל', building: '10', city: 'חיפה' };
  expect(intakeInput(draft, ['repair']).address).toEqual({ recipient_name: 'לקוח', phone: '+972501234567', street: 'הרצל', building: '10', city: 'חיפה', country: 'IL', apartment: null, postal_code: null });
});

it('clears partial persisted drafts after a storage write fails', async () => {
  const disk = new Map<string, string>();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => disk.get(key) ?? null);
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { disk.delete(key); });
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    if (key.endsWith('.1')) throw new Error('storage write failed');
    disk.set(key, value);
  });
  const store = createIntakeStore();
  await expect(store.save('s', { ...emptyDraft('machine-1'), description: 'א'.repeat(1000) })).rejects.toThrow('storage write failed');
  await store.clearAll();
  expect(disk.size).toBe(0);
});

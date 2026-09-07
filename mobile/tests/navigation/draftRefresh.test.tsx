import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useIntakeDraft } from '../../src/features/service/useIntakeDraft';
import { emptyDraft, intakeStore } from '../../src/features/service/intakeStore';

let mockFocus: () => void;
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { mockFocus = callback; } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

it('retains loaded content during a delayed Back focus refresh while blocking progression until refreshed', async () => {
  const original = { ...emptyDraft('machine-1'), description: 'תיאור קיים' };
  const load = jest.spyOn(intakeStore, 'load').mockResolvedValue(original);
  const { result } = await renderHook(() => useIntakeDraft('s', 'machine-1'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  let finish!: (value: typeof original) => void;
  load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await act(async () => mockFocus());
  expect(result.current.loaded).toBe(true);
  expect(result.current.ready).toBe(false);
  expect(result.current.draft.description).toBe('תיאור קיים');
  await act(async () => finish({ ...original, description: 'עודכן בשלב הבא' }));
  expect(result.current.ready).toBe(true);
  expect(result.current.draft.description).toBe('עודכן בשלב הבא');
});

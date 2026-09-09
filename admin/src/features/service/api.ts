import { useMutation, useQuery } from '@tanstack/react-query';
import { useWebSession } from '../auth/useWebSession';
export { dateTime, money, text, optionalText, type Schema } from '../catalog/api';

export function useStaffQuery<T>(path: string, poll = false, enabled = true) {
  const { client } = useWebSession();
  return useQuery({ queryKey: ['staff', path], queryFn: () => client.api.request<T>(path), enabled, refetchInterval: poll ? 5000 : false });
}
export function useStaffSave<T>(save: (body: T) => Promise<unknown>, onSaved?: () => void) {
  const { client } = useWebSession();
  return useMutation({ mutationFn: save, onSuccess: async () => {
    await Promise.all([
      client.queryClient.invalidateQueries({ queryKey: ['staff'] }),
      client.queryClient.invalidateQueries({ queryKey: ['commerce'] }),
    ]);
    onSaved?.();
  } });
}
export const serviceStates = ['awaiting_intake_review', 'awaiting_diagnostic_payment', 'awaiting_admin_review', 'scheduled', 'received', 'diagnosing', 'awaiting_additional_decision', 'awaiting_additional_payment', 'repair_in_progress', 'ready_for_return', 'completed', 'cancelled'] as const;
export const label = (value: string) => value.replaceAll('_', ' ');

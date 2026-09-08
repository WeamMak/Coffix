import type { components } from '@coffix/api-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useWebSession } from '../auth/useWebSession';

export type Schema = components['schemas'];
export function useAdminQuery<T>(path: string, enabled = true, poll = false) {
  const { client } = useWebSession();
  return useQuery({ queryKey: ['commerce', path], queryFn: () => client.api.request<T>(path), enabled, refetchInterval: poll ? 5000 : false });
}
export function useCommerceSave<T>(save: (body: T) => Promise<unknown>, onSaved?: () => void) {
  const { client } = useWebSession();
  return useMutation({ mutationFn: save, onSuccess: async () => {
    await client.queryClient.invalidateQueries({ queryKey: ['commerce'] });
    onSaved?.();
  } });
}
export const money = (amount: number) => new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS' }).format(amount / 100);
export const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('en-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
export const optionalText = (data: FormData, name: string) => text(data, name) || null;

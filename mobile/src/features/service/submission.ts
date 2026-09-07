import { ApiClientError } from '@coffix/api-client';
import { serviceApi, type ServiceRequest } from './api';
import type { IntakeDraft } from './intakeStore';

export async function reconcileSubmission(draft: IntakeDraft): Promise<ServiceRequest | null> {
  if (!draft.submission) return null;
  const { input, existingIds } = draft.submission;
  const matches = (await serviceApi.list()).filter(item =>
    !existingIds.includes(item.id) && item.machine_id === draft.machineId
    && item.service_type_id === input.service_type_id && item.description === input.description
    && item.location_mode === input.location_mode
    && new Date(item.preferred_window_start ?? 0).getTime() === new Date(input.preferred_window?.start ?? 0).getTime()
    && new Date(item.preferred_window_end ?? 0).getTime() === new Date(input.preferred_window?.end ?? 0).getTime()
    && (input.media_ids ?? []).every(id => item.media.some(media => media.media_id === id))
    && item.media.filter(media => media.purpose === 'issue').length === (input.media_ids ?? []).length
    && (!input.address || Object.entries(input.address).every(([key, value]) => item.address_snapshot[key] === value))
  );
  return matches.length === 1 ? matches[0]! : null;
}
export function isDefiniteRejection(error: unknown): boolean {
  return error instanceof ApiClientError && error.problem.status >= 400 && error.problem.status < 500 && ![408, 429].includes(error.problem.status);
}

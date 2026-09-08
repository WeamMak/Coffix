import type { components } from '@coffix/api-client';
import { apiClient } from '../../api/client';

export const profileApi = {
  get(): Promise<components['schemas']['UserRead']> { return apiClient.request('/api/v1/users/me'); },
  update(data: components['schemas']['UserUpdate']): Promise<components['schemas']['UserRead']> {
    return apiClient.request('/api/v1/users/me', { method: 'PATCH', body: data });
  },
};

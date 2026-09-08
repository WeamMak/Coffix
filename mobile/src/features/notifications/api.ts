import type { components } from '@coffix/api-client';
import { apiClient } from '../../api/client';

export type Notification = components['schemas']['NotificationRead'];
export type DeviceRegistration = components['schemas']['DeviceTokenRead'];
export const notificationsApi = {
  list(offset = 0): Promise<Notification[]> {
    return apiClient.request(`/api/v1/notifications?limit=50&offset=${offset}`);
  },
  unread(): Promise<components['schemas']['UnreadCountRead']> {
    return apiClient.request('/api/v1/notifications/unread-count');
  },
  read(id: string): Promise<Notification> {
    return apiClient.request(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  },
  register(token: string, platform: 'ios' | 'android', accessToken: string): Promise<DeviceRegistration> {
    return apiClient.request('/api/v1/notifications/device-tokens', {
      authenticated: false, headers: { Authorization: `Bearer ${accessToken}` }, method: 'POST', body: { token, platform },
    });
  },
  deactivate(id: string, accessToken: string): Promise<void> {
    return apiClient.request(`/api/v1/notifications/device-tokens/${encodeURIComponent(id)}`, {
      authenticated: false, headers: { Authorization: `Bearer ${accessToken}` }, method: 'DELETE',
    });
  },
};

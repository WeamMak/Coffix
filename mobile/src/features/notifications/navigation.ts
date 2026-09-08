import type { Href } from 'expo-router';
import { ordersApi } from '../orders/api';
import { serviceApi } from '../service/api';
import { notificationsApi } from './api';

export function notificationIdFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('notification_id' in data)) return null;
  const id = data.notification_id;
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

// Never trust a payload's URL, entity ID or state. The read command verifies the
// notification recipient; the detail endpoint independently verifies ownership.
export async function notificationDestination(id: string): Promise<Href | null> {
  const notification = await notificationsApi.read(id);
  const entityId = notification.related_entity_id;
  if (!entityId) return null;
  if (notification.related_entity_type === 'order') {
    await ordersApi.get(entityId);
    return { pathname: '/(tabs)/(orders)/[orderId]', params: { orderId: entityId } };
  }
  if (notification.related_entity_type === 'service_request') {
    await serviceApi.get(entityId);
    return { pathname: '/(tabs)/(service)/requests/[requestId]', params: { requestId: entityId } };
  }
  return null;
}

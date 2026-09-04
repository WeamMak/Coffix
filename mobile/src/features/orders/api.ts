import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';

export type Order = components['schemas']['OrderRead'];
export type OrderItem = components['schemas']['OrderItemRead'];
export type OrderHistoryEntry = components['schemas']['OrderHistoryRead'];
export type OrderShipment = components['schemas']['ShipmentRead'];
export type OrderAddress = components['schemas']['OrderAddressRead'];
export type OrderStatus = components['schemas']['OrderState'];

export const ordersApi = {
  get(orderId: string): Promise<Order> {
    return apiClient.request(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  },
  list(): Promise<Order[]> {
    return apiClient.request('/api/v1/orders');
  },
};

import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';

export type Address = components['schemas']['AddressRead'];
export type AddressCreate = components['schemas']['AddressCreate'];

export const addressesApi = {
  create(input: AddressCreate): Promise<Address> {
    return apiClient.request('/api/v1/users/me/addresses', {
      body: input,
      method: 'POST',
    });
  },
  list(): Promise<Address[]> {
    return apiClient.request('/api/v1/users/me/addresses');
  },
};

import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';

export type Machine = components['schemas']['RegisteredMachineRead'];
export type MachineModel = components['schemas']['MachineModelSummary'];
export type MachineCreate = components['schemas']['MachineCreate'];
export type MachineServiceHistoryEntry = components['schemas']['MachineServiceHistoryRead'];
export type MachineSource = components['schemas']['MachineSource'];

export const machinesApi = {
  completeSerial(machineId: string, serialNumber: string): Promise<Machine> {
    return apiClient.request(`/api/v1/machines/${encodeURIComponent(machineId)}/serial`, {
      body: { serial_number: serialNumber },
      method: 'PATCH',
    });
  },
  create(input: MachineCreate): Promise<Machine> {
    return apiClient.request('/api/v1/machines', { body: input, method: 'POST' });
  },
  get(machineId: string): Promise<Machine> {
    return apiClient.request(`/api/v1/machines/${encodeURIComponent(machineId)}`);
  },
  list(): Promise<Machine[]> {
    return apiClient.request('/api/v1/machines');
  },
  listModels(): Promise<MachineModel[]> {
    return apiClient.request('/api/v1/machines/models');
  },
};

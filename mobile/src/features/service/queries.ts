import { useQuery } from '@tanstack/react-query';
import { serviceApi } from './api';

export const serviceKeys = {
  detail: (scope: string, id: string) => ['private', scope, 'service', id] as const,
  list: (scope: string) => ['private', scope, 'service', 'list'] as const,
  options: (scope: string, id: string) => ['private', scope, 'service-options', id] as const,
};
export function useServiceRequest(scope: string, id: string) {
  return useQuery({ queryKey: serviceKeys.detail(scope, id), queryFn: () => serviceApi.get(id), enabled: Boolean(scope && id), staleTime: 0, refetchOnMount: 'always', refetchInterval: 5000 });
}
export function useServiceOptions(scope: string, machineId: string) {
  return useQuery({ queryKey: serviceKeys.options(scope, machineId), queryFn: () => serviceApi.options(machineId), enabled: Boolean(scope && machineId), staleTime: 0 });
}

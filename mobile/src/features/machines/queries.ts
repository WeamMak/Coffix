import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { machinesApi, type MachineCreate } from './api';

export const machineKeys = {
  detail: (scope: string, machineId: string) => [
    'private', scope, 'machines', machineId,
  ] as const,
  list: (scope: string) => ['private', scope, 'machines', 'list'] as const,
  // Supported models rarely change; unlike machines they don't need a forced
  // refetch on every focus.
  models: (scope: string) => ['private', scope, 'machines', 'models'] as const,
};

// Machine state changes server-side (warranty, serial completion, service
// history); always treat cached data as stale so returning to a screen shows
// current data.
export function useMachines(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => machinesApi.list(),
    queryKey: machineKeys.list(scope),
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useMachine(scope: string, machineId: string) {
  return useQuery({
    enabled: Boolean(scope && machineId),
    queryFn: () => machinesApi.get(machineId),
    queryKey: machineKeys.detail(scope, machineId),
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useMachineModels(scope: string) {
  return useQuery({
    enabled: Boolean(scope),
    queryFn: () => machinesApi.listModels(),
    queryKey: machineKeys.models(scope),
    staleTime: 5 * 60 * 1000,
  });
}

/** Refetch a query whenever the screen regains focus; complements pull-to-refresh. */
export function useRefetchOnFocus(refetch: () => unknown): void {
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
}

export function useCreateMachine(scope: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MachineCreate) => machinesApi.create(input),
    onSuccess: (machine) => {
      queryClient.setQueryData(machineKeys.detail(scope, machine.id), machine);
      void queryClient.invalidateQueries({ queryKey: machineKeys.list(scope) });
    },
  });
}

export function useCompleteMachineSerial(scope: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ machineId, serialNumber }: { machineId: string; serialNumber: string }) => (
      machinesApi.completeSerial(machineId, serialNumber)
    ),
    onSuccess: (machine) => {
      queryClient.setQueryData(machineKeys.detail(scope, machine.id), machine);
      void queryClient.invalidateQueries({ queryKey: machineKeys.list(scope) });
    },
  });
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MachinesListContent } from '../../app/(tabs)/(service)/index';
import type { Machine } from '../../src/features/machines/api';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function baseMachine(overrides: Partial<Machine>): Machine {
  return {
    created_at: '2026-05-01T08:00:00Z',
    customer_id: 'customer-1',
    id: 'machine-x',
    machine_model_id: 'model-x',
    media_ids: [],
    model: { id: 'model-x', manufacturer: 'Coffix', model_name: 'One' },
    purchase_date: '2025-05-01',
    serial_number: 'CFX1-000001',
    serial_pending: false,
    service_history: [],
    source: 'manual',
    source_order_item_id: null,
    source_unit_index: null,
    updated_at: '2026-05-01T08:00:00Z',
    warranty_end_date: null,
    warranty_months: null,
    warranty_start_date: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderList(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <MachinesListContent sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('machines list', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('shows an empty state with a register action when there are no machines', async () => {
    await renderList(jest.fn().mockResolvedValue(jsonResponse([])));

    expect(await screen.findByText('אין מכונות רשומות')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(service)/register');
  });

  it('shows warranty, no-warranty, pending-serial, and active-service badges and routes to detail', async () => {
    const machines = [
      baseMachine({
        id: 'm-order-active',
        model: { id: 'model-pro', manufacturer: 'Coffix', model_name: 'Pro' },
        serial_number: 'CFXP-000002',
        service_history: [
          {
            created_at: '2026-05-01T08:00:00Z',
            reference: 'SR-1',
            service_request_id: 'sr-1',
            service_type_label_he: 'תיקון',
            state: 'diagnosing',
            updated_at: '2026-05-01T08:00:00Z',
          },
          {
            created_at: '2026-04-01T08:00:00Z',
            reference: 'SR-0',
            service_request_id: 'sr-0',
            service_type_label_he: 'תיקון',
            state: 'completed',
            updated_at: '2026-04-01T08:00:00Z',
          },
        ],
        source: 'order',
        warranty_end_date: '2099-01-01',
        warranty_months: 36,
        warranty_start_date: '2026-01-01',
      }),
      baseMachine({
        id: 'm-manual',
        serial_number: 'CFX1-000003',
        source: 'manual',
      }),
      baseMachine({
        id: 'm-pending',
        serial_number: null,
        serial_pending: true,
        source: 'order',
        warranty_end_date: '2020-01-01',
        warranty_months: 36,
        warranty_start_date: '2017-01-01',
      }),
    ];
    await renderList(jest.fn().mockResolvedValue(jsonResponse(machines)));

    await screen.findByText('Pro');
    expect(screen.getByText('1 שירות פעיל')).toBeOnTheScreen();
    expect(screen.getByText('אחריות פעילה')).toBeOnTheScreen();
    expect(screen.getByText('אין אחריות')).toBeOnTheScreen();
    expect(screen.getByText('אחריות פגה')).toBeOnTheScreen();
    expect(screen.getByText('יש להשלים מספר סידורי')).toBeOnTheScreen();
    // Registration source is no longer shown as a list badge (design handoff).
    expect(screen.queryByText('נרכש באפליקציה')).toBeNull();
    expect(screen.queryByText('נרשם ידנית')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: /Coffix Pro/ }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(service)/machines/m-order-active');
  });

  it('reloads the list on pull-to-refresh', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse([baseMachine({})]));
    await renderList(fetcher);
    await screen.findByText('One');
    const before = fetcher.mock.calls.length;

    await fireEvent(screen.getByTestId('machines-list'), 'refresh');
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(before));
  });

  it('offers a retry after a failed load', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 'INTERNAL', correlationId: 'x', status: 500, title: 'boom', type: 'about:blank',
      }, 500))
      .mockResolvedValue(jsonResponse([baseMachine({})]));
    await renderList(fetcher);

    await fireEvent.press(await screen.findByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByText('One')).toBeOnTheScreen();
  });
});

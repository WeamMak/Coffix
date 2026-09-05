import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MachineDetailContent } from '../../app/(tabs)/(service)/machines/[machineId]';
import type { Machine } from '../../src/features/machines/api';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({ machineId: 'machine-1' })),
}));

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function makeMachine(overrides: Partial<Machine> = {}): Machine {
  return {
    created_at: '2026-05-01T08:00:00Z',
    customer_id: 'customer-1',
    id: 'machine-1',
    machine_model_id: 'model-pro',
    media_ids: [],
    model: { id: 'model-pro', manufacturer: 'Coffix', model_name: 'Pro' },
    purchase_date: '2025-05-01',
    serial_number: 'CFXP-000002',
    serial_pending: false,
    service_history: [],
    source: 'order',
    source_order_item_id: 'item-1',
    source_unit_index: 1,
    updated_at: '2026-05-01T08:00:00Z',
    warranty_end_date: '2099-01-01',
    warranty_months: 36,
    warranty_start_date: '2026-01-01',
    warranty_status: 'active',
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

async function renderDetail(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <MachineDetailContent machineId="machine-1" sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('machine detail', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('shows an active warranty card and matching details-row status', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeMachine())));

    const details = await screen.findByTestId('machine-details');
    expect(details).toBeOnTheScreen();
    expect(screen.getByText('פעיל · עד 01/01/2099')).toBeOnTheScreen();
    expect(screen.getByText('אחריות פעילה עד 01/01/2099')).toBeOnTheScreen();
    expect(screen.getByText('CFXP-000002')).toBeOnTheScreen();
    expect(screen.getByText('נרכש באפליקציה')).toBeOnTheScreen();
  });

  it('shows no warranty for a manually registered machine', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeMachine({
      source: 'manual',
      warranty_end_date: null,
      warranty_months: null,
      warranty_start_date: null,
      warranty_status: 'none',
    }))));

    expect((await screen.findAllByText('אין אחריות')).length).toBeGreaterThan(0);
    expect(screen.getByText('נרשם ידנית')).toBeOnTheScreen();
  });

  it('shows an expired warranty distinctly from an active one', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeMachine({
      warranty_end_date: '2020-01-01',
      warranty_status: 'expired',
    }))));

    expect(await screen.findByText('פג תוקף · 01/01/2020')).toBeOnTheScreen();
    expect(screen.getByText('אחריות פגה ב־01/01/2020')).toBeOnTheScreen();
  });

  it('displays the server warranty status even when the device date disagrees', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeMachine({
      warranty_end_date: '2000-01-01',
      warranty_status: 'active',
    }))));
    expect(await screen.findByText('פעיל · עד 01/01/2000')).toBeOnTheScreen();
  });

  it('offers serial completion for a pending-serial machine and saves it', async () => {
    const fetcher = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(makeMachine({
          serial_number: 'CFXP-009999',
          serial_pending: false,
        })));
      }
      return Promise.resolve(jsonResponse(makeMachine({ serial_number: null, serial_pending: true })));
    });
    await renderDetail(fetcher);

    expect((await screen.findAllByText('יש להשלים מספר סידורי')).length).toBeGreaterThan(0);
    const form = await screen.findByTestId('serial-completion');
    expect(form).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'CFXP-009999');
    await fireEvent.press(screen.getByRole('button', { name: 'שמירת מספר סידורי' }));

    expect(await screen.findByText('CFXP-009999')).toBeOnTheScreen();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/machines\/machine-1\/serial$/),
      expect.objectContaining({
        body: JSON.stringify({ serial_number: 'CFXP-009999' }),
        method: 'PATCH',
      }),
    );
  });

  it('shows a duplicate-serial error without losing the entered value', async () => {
    const fetcher = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({
          code: 'MACHINE_SERIAL_ALREADY_REGISTERED',
          correlationId: 'x',
          status: 409,
          title: 'duplicate',
          type: 'about:blank',
        }, 409));
      }
      return Promise.resolve(jsonResponse(makeMachine({ serial_number: null, serial_pending: true })));
    });
    await renderDetail(fetcher);

    await screen.findByTestId('serial-completion');
    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'CFXP-000002');
    await fireEvent.press(screen.getByRole('button', { name: 'שמירת מספר סידורי' }));

    expect(await screen.findByText('מספר סידורי זה כבר רשום למכונה אחרת.')).toBeOnTheScreen();
  });

  it('renders service history entries with their status', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeMachine({
      service_history: [
        {
          created_at: '2026-05-10T09:00:00Z',
          reference: 'SR-1001',
          service_request_id: 'sr-1',
          service_type_label_he: 'תיקון',
          state: 'completed',
          updated_at: '2026-05-12T09:00:00Z',
        },
        {
          created_at: '2026-05-13T09:00:00Z',
          reference: 'SR-1002',
          service_request_id: 'sr-2',
          service_type_label_he: 'ניקוי עמוק',
          state: 'awaiting_diagnostic_payment',
          updated_at: '2026-05-13T09:00:00Z',
        },
      ],
    }))));

    expect(await screen.findByText('תיקון')).toBeOnTheScreen();
    expect(screen.getByText(/SR-1001/)).toBeOnTheScreen();
    expect(screen.getByText('הושלם')).toBeOnTheScreen();
    expect(screen.getByText('ניקוי עמוק')).toBeOnTheScreen();
    expect(screen.getByText('ממתין לתשלום אבחון')).toBeOnTheScreen();
  });

  it('shows a friendly message for a missing or foreign machine', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse({
      code: 'MACHINE_NOT_FOUND', correlationId: 'x', status: 404, title: 'Machine not found', type: 'about:blank',
    }, 404)));

    expect(await screen.findByText('לא מצאנו את המכונה')).toBeOnTheScreen();
  });

  it('reloads the machine on pull-to-refresh', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(makeMachine()));
    await renderDetail(fetcher);
    await screen.findByTestId('machine-detail-list');
    const before = fetcher.mock.calls.length;

    await fireEvent(screen.getByTestId('machine-detail-list'), 'refresh');
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(before));
  });
});

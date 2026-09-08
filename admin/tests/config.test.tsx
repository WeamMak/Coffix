import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, problem } from './commerceSupport';

const model = { id: 'model-1', manufacturer: 'Coffix', model_name: 'Classic', serial_pattern: null, default_warranty_months: 12, is_active: true, created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z' };
const type = { id: 'type-1', label_he: 'תיקון', label_en: 'Repair', icon_key: 'tool', tags_he: ['בדיקה'], diagnostic_fee_agorot: 5000, is_active: true, version: 3, machine_model_ids: ['model-1'] };
it('edits service metadata and model mappings with the server version and confirms the indicative price', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/configuration/service-types', (url) => Response.json(url.pathname.endsWith('/machine-models') ? [model] : [type]));
  await user.click(await screen.findByRole('button', { name: 'Edit Repair' }));
  await user.selectOptions(screen.getByLabelText('Service icon'), 'coffee');
  await user.clear(screen.getByLabelText('Starting price (agorot)'));
  await user.type(screen.getByLabelText('Starting price (agorot)'), '7500');
  await user.click(screen.getByRole('button', { name: 'Review service type' }));
  await user.click(screen.getByRole('button', { name: 'Save service type' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('75.00');
  await user.click(screen.getByRole('button', { name: 'Confirm save service type' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/service-types/type-1') && String(init?.body).includes('"expected_version":3') && String(init?.body).includes('"icon_key":"coffee"'))).toBe(true));
});
it('preserves an intake-settings draft on a version conflict', async () => {
  const user = userEvent.setup();
  const settings = { version: 5, urgencies: [{ id: 'normal', name_he: 'רגיל', description_he: 'רגיל', surcharge_percent: 0 }], weekdays: [0, 1, 2, 3, 6], slots: [{ start: '08:00', end: '12:00' }], horizon_days: 14, response_hours: 4 };
  const fetcher = commercePage('/configuration/intake', (_url, init) => init?.method === 'PUT' ? problem('SERVICE_INTAKE_VERSION_CONFLICT', 'Intake settings changed; reload before saving') : Response.json(settings));
  await user.clear(await screen.findByLabelText('Expected response hours'));
  await user.type(screen.getByLabelText('Expected response hours'), '8');
  await user.click(screen.getByRole('button', { name: 'Review intake settings' }));
  await user.click(screen.getByRole('button', { name: 'Save intake settings' }));
  await user.click(screen.getByRole('button', { name: 'Confirm save intake settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed');
  expect(screen.getByLabelText('Expected response hours')).toHaveValue(8);
  expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body).toContain('"version":5');
});

it('creates machine metadata with a serial rule and warranty months', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/configuration', (_url, init) => Response.json(init?.method === 'POST' ? model : [model]));
  await user.click(await screen.findByRole('button', { name: 'New machine model' }));
  await user.type(screen.getByLabelText('Manufacturer'), 'Coffix');
  await user.type(screen.getByLabelText('Model name'), 'Compact');
  await user.click(screen.getByLabelText('Serial pattern'));
  await user.paste('^CF[0-9]+$');
  await user.click(screen.getByRole('button', { name: 'Save machine model' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/machine-models') && init?.method === 'POST')?.[1]?.body).toContain('"model_name":"Compact"'));
});

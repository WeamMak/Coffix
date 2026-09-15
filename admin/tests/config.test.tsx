import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, problem } from './commerceSupport';

const model = { id: 'model-1', manufacturer: 'Coffix', model_name: 'Classic', serial_pattern: null, default_warranty_months: 12, is_active: true, created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z' };
const type = { id: 'type-1', label_he: 'תיקון', label_en: 'Repair', icon_key: 'tool', tags_he: ['בדיקה'], diagnostic_fee_agorot: 5000, is_active: true, version: 3, machine_model_ids: ['model-1'] };
it('edits service metadata and model mappings with the server version and confirms the indicative price', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/configuration/service-types', (url) => Response.json(url.pathname.endsWith('/machine-models') ? [model] : [type]));
  await user.click(await screen.findByRole('button', { name: 'עריכה תיקון' }));
  await user.selectOptions(screen.getByLabelText('סמל שירות'), 'coffee');
  expect(screen.getByRole('img', { name: 'תצוגה מקדימה: קפה' })).toBeVisible();
  await user.clear(screen.getByLabelText('מחיר התחלתי באגורות'));
  await user.type(screen.getByLabelText('מחיר התחלתי באגורות'), '7500');
  await user.click(screen.getByRole('button', { name: 'סקירת סוג השירות' }));
  await user.click(screen.getByRole('button', { name: 'שמירת סוג שירות' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('75.00');
  await user.click(screen.getByRole('button', { name: 'אישור: שמירת סוג שירות' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/service-types/type-1') && String(init?.body).includes('"expected_version":3') && String(init?.body).includes('"icon_key":"coffee"'))).toBe(true));
});
it('preserves an intake-settings draft on a version conflict', async () => {
  const user = userEvent.setup();
  const settings = { version: 5, urgencies: [{ id: 'normal', name_he: 'רגיל', description_he: 'רגיל', surcharge_percent: 0 }], weekdays: [0, 1, 2, 3, 6], slots: [{ start: '08:00', end: '12:00' }], horizon_days: 14, response_hours: 4 };
  const fetcher = commercePage('/configuration/intake', (_url, init) => init?.method === 'PUT' ? problem('SERVICE_INTAKE_VERSION_CONFLICT', 'Intake settings changed; reload before saving') : Response.json(settings));
  await user.clear(await screen.findByLabelText('זמן תגובה צפוי בשעות'));
  await user.type(screen.getByLabelText('זמן תגובה צפוי בשעות'), '8');
  await user.click(screen.getByRole('button', { name: 'סקירת הגדרות קבלת שירות' }));
  await user.click(screen.getByRole('button', { name: 'שמירת הגדרות קבלת שירות' }));
  await user.click(screen.getByRole('button', { name: 'אישור: שמירת הגדרות קבלת שירות' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('הרשומה השתנתה');
  expect(screen.getByLabelText('זמן תגובה צפוי בשעות')).toHaveValue(8);
  expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body).toContain('"version":5');
});

it('creates machine metadata with a serial rule and warranty months', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/configuration', (_url, init) => Response.json(init?.method === 'POST' ? model : [model]));
  await user.click(await screen.findByRole('button', { name: 'דגם מכונה חדש' }));
  await user.type(screen.getByLabelText('יצרן'), 'Coffix');
  await user.type(screen.getByLabelText('שם הדגם'), 'Compact');
  await user.click(screen.getByLabelText('תבנית מספר סידורי'));
  await user.paste('^CF[0-9]+$');
  await user.click(screen.getByRole('button', { name: 'שמירת דגם מכונה' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/machine-models') && init?.method === 'POST')?.[1]?.body).toContain('"model_name":"Compact"'));
});

const shop = { version: 1, shipping_fee_agorot: 3000, shop_address: { street: 'הרצל', building: '12', city: 'חיפה', postal_code: null, country: 'IL' }, phone: '+97231234567', whatsapp: null, email: null, opening_hours: 'א–ה 09:00–17:00\nשישי סגור' };
it('reviews exact shekel amounts and preserves shop drafts after a stale save', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/configuration/shop', (_url, init) => init?.method === 'PUT' ? problem('SHOP_SETTINGS_VERSION_CONFLICT', 'changed') : Response.json(shop));
  const fee = await screen.findByLabelText('דמי משלוח בשקלים');
  await user.clear(fee); await user.type(fee, '40.01');
  await user.click(screen.getByRole('button', { name: 'סקירת השינויים' }));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  expect(screen.getByRole('columnheader', { name: 'לפני' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'שמירת הגדרות החנות' }));
  await user.click(screen.getByRole('button', { name: 'אישור: שמירת הגדרות החנות' }));
  await screen.findByRole('alert');
  expect(fee).toHaveValue('40.01');
  expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body).toContain('"shipping_fee_agorot":4001');
  await user.click(screen.getByRole('button', { name: 'ביטול' }));
  await user.click(screen.getByRole('button', { name: 'טעינה מחדש וביטול הטיוטה' }));
  expect(await screen.findByLabelText('דמי משלוח בשקלים')).toHaveValue('30.00');
});

it('saves free shipping only after confirmation and clears optional contacts', async () => {
  const user = userEvent.setup();
  let current = shop;
  const fetcher = commercePage('/configuration/shop', (_url, init) => {
    if (init?.method === 'PUT') current = { ...JSON.parse(String(init.body)), version: 2 };
    return Response.json(current);
  });
  await user.clear(await screen.findByLabelText('דמי משלוח בשקלים'));
  await user.type(screen.getByLabelText('דמי משלוח בשקלים'), '0');
  await user.clear(screen.getByLabelText('טלפון'));
  await user.click(screen.getByRole('button', { name: 'סקירת השינויים' }));
  await user.click(screen.getByRole('button', { name: 'שמירת הגדרות החנות' }));
  await user.click(screen.getByRole('button', { name: 'ביטול' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'שמירת הגדרות החנות' }));
  await user.click(screen.getByRole('button', { name: 'אישור: שמירת הגדרות החנות' }));
  await screen.findByText('הגדרות החנות נשמרו.');
  expect(current.shipping_fee_agorot).toBe(0);
  expect(current.phone).toBeNull();
});

it.each(['-1', '1.001', '1e2'])('rejects an invalid shekel input %s before review', async value => {
  const user = userEvent.setup();
  commercePage('/configuration/shop', () => Response.json(shop));
  const fee = await screen.findByLabelText('דמי משלוח בשקלים');
  await user.clear(fee); await user.type(fee, value);
  await user.click(screen.getByRole('button', { name: 'סקירת השינויים' }));
  expect(screen.queryByRole('button', { name: 'שמירת הגדרות החנות' })).toBeNull();
});

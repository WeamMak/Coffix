import { expect } from '@playwright/test';
import { api, confirm, createCustomer, test, type Schema } from './staffFixtures';

test('reassignment revokes the old technician’s job access and every admin screen/API is protected', async ({ staff }) => {
  test.setTimeout(120_000);
  const page = await staff.admin.newPage();
  const techPage = await staff.technician.newPage();
  const request = staff.admin.request;
  const admin = staff.adminSession.access_token;
  const technician = staff.technicianSession;
  const suffix = Date.now().toString();
  const customer = await createCustomer(request, `054${suffix.slice(-7)}`);
  const model: Schema['MachineModelRead'] = await (await api(request, admin, '/admin/machine-models', { manufacturer: 'Browser', model_name: `Permissions ${suffix}` })).json();
  const type: Schema['ServiceTypeRead'] = await (await api(request, admin, '/admin/service-types', { label_he: `בדיקת הרשאות ${suffix}`, label_en: `Permissions ${suffix}`, diagnostic_fee_agorot: 5000, machine_model_ids: [model.id] })).json();
  const machine: Schema['RegisteredMachineRead'] = await (await api(request, customer, '/machines', { machine_model_id: type.machine_model_ids[0], serial_number: `PERMISSION-${suffix}` })).json();
  const options: Schema['ServiceIntakeOptionsRead'] = await (await api(request, customer, `/machines/${machine.id}/service-options`)).json();
  const job: Schema['ServiceRequestRead'] = await (await api(request, customer, `/machines/${machine.id}/service-requests`, { service_type_id: type.id, description: 'Assignment permission test request.', location_mode: 'bring_in', urgency_id: options.urgencies[0].id, intake_version: options.version })).json();
  await api(request, admin, `/admin/service-requests/${job.id}/diagnostic-fee`, { amount_agorot: 10000 });
  const payment: Schema['ServicePaymentIntentRead'] = await (await api(request, customer, `/service-requests/${job.id}/diagnostic-payment`, undefined, 'POST', `permissions-${suffix}`)).json();
  await api(request, admin, '/test/payments/webhooks', { event_id: `permissions-paid-${suffix}`, event_type: 'payment_intent.succeeded', provider_object_id: payment.provider_payment_id, state: 'confirmed' });
  const start = new Date(Date.now() + 5 * 86400000).toISOString();
  const end = new Date(Date.now() + 5 * 86400000 + 3600000).toISOString();
  await api(request, admin, `/admin/service-requests/${job.id}/appointment`, { technician_id: technician.user_id, start, end, allow_overlap: true });
  await techPage.goto(`/jobs/${job.id}`);
  await expect(techPage.getByRole('heading', { name: job.reference, exact: true })).toBeVisible();
  const visibility = await request.post(`/api/v1/technician/jobs/${job.id}/notes`, { headers: { Authorization: `Bearer ${technician.access_token}` }, data: { body: 'Should not become public', visibility: 'customer' } });
  expect(visibility.status()).toBe(422);

  const otherPhone = `053${suffix.slice(-7)}`;
  await createCustomer(request, otherPhone);
  const people: Schema['AdminUserRead'][] = await (await api(request, admin, `/admin/users?q=${encodeURIComponent(`+972${otherPhone.slice(1)}`)}`)).json();
  const other = people[0];
  await page.goto(`/people?q=${encodeURIComponent(`+972${otherPhone.slice(1)}`)}`);
  await page.getByRole('button', { name: 'Manage Task 27 Customer', exact: true }).click();
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption('technician');
  await page.getByRole('button', { name: 'Review access change', exact: true }).click();
  await confirm(page, 'Change access');
  await page.goto(`/service/${job.id}`);
  await page.getByLabel('Find technician').fill(otherPhone.slice(1));
  await page.getByRole('combobox', { name: 'Technician', exact: true }).selectOption(other.id);
  await page.getByLabel('Assignment reason').fill('Assign to the next shift');
  await page.getByRole('button', { name: 'Review assignment', exact: true }).click();
  await confirm(page, 'Change technician');
  await techPage.getByRole('button', { name: 'Refresh request', exact: true }).click();
  await expect(techPage.getByRole('alert')).toContainText('not found');
  await expect(techPage.getByText(`PERMISSION-${suffix}`, { exact: true })).toHaveCount(0);
  for (const [method, endpoint, body] of [
    ['GET', '', undefined], ['POST', '/status', { action: 'receive' }], ['POST', '/notes', { body: 'Forbidden note' }], ['POST', '/media', { media_id: job.id }],
  ] as const) {
    const response = await request.fetch(`/api/v1/technician/jobs/${job.id}${endpoint}`, { method, data: body, headers: { Authorization: `Bearer ${technician.access_token}` } });
    expect(response.status()).toBe(404);
  }
  for (const route of ['/overview', '/service', `/service/${job.id}`, '/configuration', '/configuration/service-types', '/configuration/intake', '/configuration/shop', '/people', '/operations', '/operations/audit']) {
    await techPage.goto(route);
    await expect(techPage.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible();
    await expect(techPage.getByRole('link', { name: 'Configuration', exact: true })).toHaveCount(0);
  }
  for (const path of ['dashboard', 'service-requests', `service-requests/${job.id}`, 'users', 'technicians', 'machine-models', 'service-types', 'service-intake-settings', 'configuration', 'notification-deliveries', 'audit-logs']) {
    const response = await request.get(`/api/v1/admin/${path}`, { headers: { Authorization: `Bearer ${technician.access_token}` } });
    expect(response.status()).toBe(403);
  }
  for (const path of ['diagnostic-fee', 'appointment-preview', 'appointment', 'assignment', 'quote', 'no-cost-repair', 'status', 'notes', 'cancel']) {
    const response = await request.post(`/api/v1/admin/service-requests/${job.id}/${path}`, { headers: { Authorization: `Bearer ${technician.access_token}` }, data: {} });
    expect(response.status()).toBe(403);
  }
  for (const [method, path] of [['PATCH', `users/${other.id}`], ['POST', 'machine-models'], ['PATCH', `machine-models/${machine.machine_model_id}`], ['POST', 'service-types'], ['PATCH', `service-types/${type.id}`], ['PUT', 'service-intake-settings'], ['POST', `notification-deliveries/${job.id}/retry`]]) {
    const response = await request.fetch(`/api/v1/admin/${path}`, { method, headers: { Authorization: `Bearer ${technician.access_token}` }, data: {} });
    expect(response.status()).toBe(403);
  }
  await page.goto(`/operations/audit?action=service.assignment_changed&target_id=${job.id}`);
  await expect(page.getByRole('cell', { name: 'service.assignment_changed', exact: true })).toBeVisible();
  await page.close(); await techPage.close();
});

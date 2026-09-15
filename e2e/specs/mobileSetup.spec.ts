import { expect } from '@playwright/test';
import { actors, api, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { intake } from '../fixtures/service';

// Also invoked alone by `e2e-local.sh serve`; its data remains until shutdown.
test('prepares a deterministic mobile endpoint with catalog, manual machine and service intake', async ({ request }) => {
  const a = await actors(request);
  const { product } = await catalog(request, a.admin, 5);
  const { machine, service } = await intake(request, a.admin, a.customer);
  expect((await api(request, a.customer, `/catalog/products/${product.id}`)).name_he).toBe('מכונת בדיקה');
  expect((await api(request, a.customer, `/machines/${machine.id}`)).serial_number).toBe('E2E-MANUAL-001');
  expect((await api(request, a.customer, `/service-requests/${service.id}`)).state).toBe('awaiting_intake_review');
});

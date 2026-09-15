import { expect } from '@playwright/test';
import { actors, api, call, test } from '../fixtures/users';
import { diagnose, intake } from '../fixtures/service';
import { paymentEvent } from '../helpers/fakeProviders';

for (const outcome of ['no-extra-cost', 'paid-extra-cost', 'declined'] as const) {
  test(`manual machine, diagnostic payment, assigned technician and ${outcome} service`, async ({ request }) => {
    const a = await actors(request);
    const { service } = await intake(request, a.admin, a.customer);
    await diagnose(request, a.admin, a.technician, a.customer, service.id);
    expect((await api(request, a.technician, '/technician/jobs')).map((job: { id: string }) => job.id)).toContain(service.id);
    if (outcome === 'no-extra-cost') {
      await api(request, a.admin, `/admin/service-requests/${service.id}/no-cost-repair`, undefined, 'POST');
    } else {
      await api(request, a.admin, `/admin/service-requests/${service.id}/quote`, { amount_agorot: 20000, explanation: 'החלפת משאבה' });
      await api(request, a.customer, `/service-requests/${service.id}/quote-decision`, { decision: outcome === 'declined' ? 'declined' : 'accepted' });
      if (outcome === 'declined') {
        const declined = await api(request, a.customer, `/service-requests/${service.id}`);
        expect(declined.state).toBe('cancelled');
        expect(declined.quotes[0].decision).toBe('declined');
        expect((await call(request, a.admin, `/admin/service-requests/${service.id}/no-cost-repair`, undefined, 'POST')).status()).toBe(409);
        return;
      }
      expect((await call(request, a.technician, `/technician/jobs/${service.id}/status`, { action: 'ready_for_return' })).status()).toBe(409);
      expect((await call(request, a.admin, `/admin/service-requests/${service.id}/no-cost-repair`, undefined, 'POST')).status()).toBe(409);
      const payment = await api(request, a.customer, `/service-requests/${service.id}/additional-payment`, undefined, 'POST', 'additional-one');
      await paymentEvent(request, payment.provider_payment_id, 'additional-one');
    }
    await api(request, a.technician, `/technician/jobs/${service.id}/notes`, { body: 'בדיקה פנימית של הטכנאי' });
    expect((await api(request, a.customer, `/service-requests/${service.id}`)).notes).toEqual([]);
    await api(request, a.technician, `/technician/jobs/${service.id}/status`, { action: 'ready_for_return' });
    await api(request, a.admin, `/admin/service-requests/${service.id}/status`, { action: 'complete' });
    expect((await api(request, a.customer, `/service-requests/${service.id}`)).state).toBe('completed');
  });
}

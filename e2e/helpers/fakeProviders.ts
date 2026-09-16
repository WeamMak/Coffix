import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { now } from './clock';
import { control, controlHeaders } from './dbReset';
export async function paymentEvent(request: APIRequestContext, objectId: string, eventId: string, refund = false, state: 'confirmed' | 'failed' = 'confirmed') {
  const body = JSON.stringify({ id: eventId, type: refund ? 'refund.updated' : state === 'failed' ? 'payment_intent.payment_failed' : 'payment_intent.succeeded', data: { object: { id: objectId, status: state } } });
  const timestamp = Math.floor(new Date(await now(request)).getTime() / 1000);
  const signature = createHmac('sha256', process.env.E2E_CONTROL_SECRET!).update(`${timestamp}.${body}`).digest('hex');
  const response = await request.post('/api/v1/__e2e/payments', { data: body, headers: { ...controlHeaders(), 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
export const workers = (request: APIRequestContext) => control(request, '/workers');
export const pushFailure = (request: APIRequestContext, device_token: string) => control(request, '/push', { device_token, status: 'retryable_failure' });

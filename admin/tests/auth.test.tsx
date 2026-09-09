import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createWebClient } from '../src/api/client';
import { WebSessionProvider } from '../src/features/auth/useWebSession';
import { AppRoutes } from '../src/router';

const expired = () => new Response(JSON.stringify({ code: 'unauthorized' }), { status: 401 });
const session = (role: string) => ({ access_token: `${role}-token`, user_id: 'staff-1', role });

export function renderApp(fetcher: typeof fetch, path = '/') {
  const client = createWebClient({ baseUrl: '/api/v1', fetch: async (input, init) => {
    if (String(input).endsWith('/admin/dashboard')) return Response.json({ product_revenue_agorot: 0, open_services: 0, awaiting_payment_orders: 0, awaiting_payment_services: 0, users_by_role: {}, orders_by_state: {}, service_requests_by_state: {}, failed_deliveries: 0, failed_outbox_events: 6, pending_outbox_events: 0, low_stock_skus: 0, todays_appointments: [] });
    if (String(input).endsWith('/technician/jobs')) return Response.json([]);
    return fetcher(input, init);
  } });
  render(
    <WebSessionProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </WebSessionProvider>,
  );
  return client;
}

describe('staff OTP session', () => {
  it.each(['admin', 'technician'])('signs in %s, restores on refresh, and logs out', async (role) => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(Response.json({ message: 'Code sent' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(session(role)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = renderApp(fetcher);
    await user.type(await screen.findByLabelText('Phone number'), '0501234567');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', {
      name: role === 'admin' ? 'Overview' : 'My jobs',
    })).toBeVisible();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      credentials: 'include', method: 'POST',
      headers: expect.objectContaining({ 'X-CSRF-Protection': '1' }),
    });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeVisible();
    expect(client.getSnapshot().session).toBeNull();
  });

  it('restores a cookie session without asking for OTP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(session('admin')));
    renderApp(fetcher);
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/auth/web/refresh');
  });

  it('renders a staff rejection and stays signed out', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(Response.json({ message: 'Code sent' }))
      .mockResolvedValueOnce(Response.json({
        title: 'Staff access required', code: 'staff_required', correlationId: 'request-123',
      }, { status: 403 }));
    renderApp(fetcher);
    await user.type(await screen.findByLabelText('Phone number'), '0501234567');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Staff access required');
    expect(screen.getByRole('alert')).toHaveTextContent('request-123');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('deduplicates refresh while parallel requests receive expired access responses', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session('admin')))
      .mockImplementation(async (_url, options) => {
        if (String(_url).endsWith('/auth/web/refresh')) return Response.json({ ...session('admin'), access_token: 'new-token' });
        if (new Headers(options?.headers).get('Authorization') === 'Bearer new-token') return Response.json({ ok: true });
        return expired();
      });
    const client = createWebClient({ baseUrl: '/api/v1', fetch: fetcher });
    await client.restore();
    await Promise.all([client.api.request('/first'), client.api.request('/second')]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/web/refresh'))).toHaveLength(2);
  });

  it('keeps the session visible if logout fails so staff can retry', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session('admin')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderApp(fetcher);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect'));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('serializes cookie rotation across separate browser clients', async () => {
    let queued = Promise.resolve<unknown>(null);
    const locks = { request: (_name: string, work: () => Promise<unknown>) => {
      const result = queued.then(work);
      queued = result.catch(() => null);
      return result;
    } };
    vi.stubGlobal('navigator', { locks });
    let active = 0;
    let maximumActive = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      active += 1; maximumActive = Math.max(active, maximumActive);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return Response.json(session('admin'));
    });
    await Promise.all([
      createWebClient({ baseUrl: '/api/v1', fetch: fetcher }).restore(),
      createWebClient({ baseUrl: '/api/v1', fetch: fetcher }).restore(),
    ]);
    expect(maximumActive).toBe(1);
  });

  it('discards an in-flight staff response after logout and clears cached data', async () => {
    let respond!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session('admin')))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { respond = resolve; }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createWebClient({ baseUrl: '/api/v1', fetch: fetcher });
    await client.restore();
    client.queryClient.setQueryData(['orders'], ['private order']);
    const pending = client.api.request('/orders');
    await client.logout();
    expect(client.queryClient.getQueryData(['orders'])).toBeUndefined();
    respond(Response.json(['private order']));
    await expect(pending).rejects.toThrow('Session changed');
    expect(client.getSnapshot().session).toBeNull();
  });
});

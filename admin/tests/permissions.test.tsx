import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@coffix/api-client';
import { createWebClient } from '../src/api/client';
import { WebSessionProvider } from '../src/features/auth/useWebSession';
import { AppRoutes } from '../src/router';
import { ConfirmAction } from '../src/components/ConfirmAction';
import { DataTable } from '../src/components/DataTable';
import { FormField } from '../src/components/FormField';
import { ProblemBanner } from '../src/components/ProblemBanner';
import { StatusBadge } from '../src/components/StatusBadge';

function staffPage(role: string, path: string) {
  const client = createWebClient({ baseUrl: '/api/v1', fetch: vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({ access_token: 'token', user_id: 'staff-1', role, items: [], total: 0 }),
  ) });
  render(<WebSessionProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></WebSessionProvider>);
}

describe('permissions', () => {
  it.each(['/overview', '/catalog', '/orders', '/service', '/configuration', '/people', '/operations', '/catalog/categories', '/catalog/products/new', '/catalog/products/product-1', '/catalog/inventory', '/orders/order-1', '/service/service-1', '/configuration/service-types', '/configuration/intake', '/configuration/shop', '/operations/audit'])(
    'hides admin navigation and denies technician direct entry to %s', async (path) => {
      staffPage('technician', path);
      expect(await screen.findByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'העבודות שלי' })).toBeVisible();
      expect(screen.queryByRole('link', { name: 'קטלוג' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'הזמנות' })).not.toBeInTheDocument();
    },
  );
  it('gives administrators the full navigation and marks the active page', async () => {
    staffPage('admin', '/catalog');
    expect(await screen.findByRole('heading', { name: 'קטלוג' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'קטלוג' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'דילוג לתוכן' })).toHaveAttribute('href', '#main-content');
    expect(screen.queryByRole('link', { name: 'העבודות שלי' })).not.toBeInTheDocument();
  });
  it('rejects a customer response defensively', async () => {
    staffPage('customer', '/orders');
    expect(await screen.findByRole('heading', { name: 'כניסה לצוות' })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('shared components', () => {
  it('requires confirmation of the record and exact amount, supports cancel and prevents duplicate actions', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ConfirmAction label="החזר הזמנה" recordLabel="CFX-102" amountAgorot={12550} onConfirm={action} />);
    await user.click(screen.getByRole('button', { name: 'החזר הזמנה' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('CFX-102');
    expect(screen.getByRole('dialog')).toHaveTextContent('125.50');
    expect(screen.getByRole('button', { name: 'ביטול' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'החזר הזמנה' }));
    await user.dblClick(screen.getByRole('button', { name: 'אישור: החזר הזמנה' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'מבצעים…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('allows Escape to cancel and keeps failed confirmations reviewable', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockRejectedValue(new TypeError('Network failure'));
    render(<ConfirmAction label="ביטול הזמנה" recordLabel="CFX-103" onConfirm={action} />);
    await user.click(screen.getByRole('button', { name: 'ביטול הזמנה' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ביטול הזמנה' }));
    await user.click(screen.getByRole('button', { name: 'אישור: ביטול הזמנה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן להתחבר');
    expect(screen.getByRole('dialog')).toHaveTextContent('CFX-103');
  });
  it('renders accessible data, loading, empty and error states', () => {
    const columns = [{ key: 'name', label: 'שם', render: (row: { id: string; name: string }) => row.name }];
    const props = { caption: 'הזמנות', columns, rowKey: (row: { id: string }) => row.id };
    const view = render(<DataTable {...props} rows={[]} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('טוענים');
    view.rerender(<DataTable {...props} rows={[]} emptyMessage="No orders found" />);
    expect(screen.getByText('No orders found')).toBeVisible();
    view.rerender(<DataTable {...props} rows={[{ id: 'one', name: 'CFX-102' }]} />);
    expect(screen.getByRole('table', { name: 'הזמנות' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'שם' })).toBeVisible();
    expect(screen.getByRole('cell', { name: 'CFX-102' })).toBeVisible();
    view.rerender(<DataTable {...props} rows={[]} error={new Error('offline')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('לא ניתן להתחבר');
  });
  it('connects field errors and renders status text independent of color', () => {
    render(<><FormField label="Amount" error="Enter a positive amount" /><StatusBadge label="Awaiting payment" tone="warning" /></>);
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveAccessibleDescription('Enter a positive amount');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Awaiting payment')).toBeVisible();
  });
  it('renders a stable problem with its support reference without interpreting HTML', () => {
    render(<ProblemBanner error={new ApiClientError({ type: 'about:blank', status: 409, code: 'conflict', title: '<script>bad</script>', correlationId: 'ref-42' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('הרשומה השתנתה');
    expect(screen.getByRole('alert')).not.toHaveTextContent('<script>bad</script>');
    expect(screen.getByRole('alert')).toHaveTextContent('ref-42');
    expect(document.querySelector('script')).toBeNull();
  });
  it('uses a safe Hebrew fallback for unknown backend errors and isolates the support reference', () => {
    render(<ProblemBanner error={new ApiClientError({ type: 'about:blank', status: 500, code: 'provider_crash', title: 'Provider stack: secret', correlationId: 'req-123-ABC' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('לא ניתן להשלים את הפעולה. נסו שוב.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Provider stack');
    expect(screen.getByText('req-123-ABC')).toHaveAttribute('dir', 'ltr');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const saveWebhookEndpointAction = vi.fn();
const sendTestEventAction = vi.fn();
const revealWebhookSecretAction = vi.fn();
vi.mock('./actions', () => ({
  saveWebhookEndpointAction,
  sendTestEventAction,
  revealWebhookSecretAction,
  rollWebhookSecretAction: vi.fn(),
  reenableWebhookEndpointAction: vi.fn(),
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));

const { WebhookEndpointCard } = await import('./WebhookEndpointCard');

describe('WebhookEndpointCard', () => {
  it('shows an error and lets you retry when saving fails on the server', async () => {
    saveWebhookEndpointAction.mockRejectedValueOnce(new Error('server exploded'));
    render(<WebhookEndpointCard merchantId="mer_1" endpoint={null} />);
    await userEvent.type(screen.getByLabelText('Webhook endpoint URL'), 'https://webhook.site/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the endpoint. Try again in a moment."));
    expect(screen.getByRole('button', { name: 'Save endpoint' })).toBeEnabled();
  });

  it('shows an error when revealing the secret fails on the server', async () => {
    revealWebhookSecretAction.mockRejectedValueOnce(new Error('server exploded'));
    render(<WebhookEndpointCard merchantId="mer_1" endpoint={{ url: 'https://webhook.site/abc', enabled: true }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't load the signing secret. Try again in a moment."));
  });

  it('shows an error when sending a test event fails on the server', async () => {
    sendTestEventAction.mockRejectedValueOnce(new Error('server exploded'));
    render(<WebhookEndpointCard merchantId="mer_1" endpoint={{ url: 'https://webhook.site/abc', enabled: true }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send test event' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't send the test event. Try again in a moment."));
  });

  it('confirms a saved endpoint and a sent test event with a toast', async () => {
    saveWebhookEndpointAction.mockResolvedValueOnce({ ok: true, url: 'https://webhook.site/abc' });
    sendTestEventAction.mockResolvedValueOnce({ ok: true, eventId: 'evt_1' });
    render(<WebhookEndpointCard merchantId="mer_1" endpoint={null} />);
    await userEvent.type(screen.getByLabelText('Webhook endpoint URL'), 'https://webhook.site/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Endpoint saved'));
    await userEvent.click(screen.getByRole('button', { name: 'Send test event' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent payment.succeeded', { description: 'It arrives at your endpoint in a few seconds.' }));
  });

  it('shows a refused URL both under the field and as a toast', async () => {
    saveWebhookEndpointAction.mockResolvedValueOnce({ ok: false, error: 'Webhook URLs must use https.' });
    render(<WebhookEndpointCard merchantId="mer_1" endpoint={null} />);
    await userEvent.type(screen.getByLabelText('Webhook endpoint URL'), 'https://webhook.site/abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect(await screen.findByText('Webhook URLs must use https.')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Webhook URLs must use https.');
  });

  it('shows the disabled banner when the endpoint it is given becomes disabled', () => {
    const { rerender } = render(<WebhookEndpointCard merchantId="mer_1" endpoint={{ url: 'https://webhook.site/abc', enabled: true }} />);
    expect(screen.queryByText('Disabled after 20 failed events in a row')).toBeNull();
    rerender(<WebhookEndpointCard merchantId="mer_1" endpoint={{ url: 'https://webhook.site/abc', enabled: false }} />);
    expect(screen.getByText('Disabled after 20 failed events in a row')).toBeInTheDocument();
  });
});

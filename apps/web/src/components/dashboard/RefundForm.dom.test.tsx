import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { RefundDialog, RefundForm } = await import('./RefundForm');

describe('RefundForm (PS-RF-010)', () => {
  it('starts empty, so nothing is refunded by accident, and needs an amount and a reason', async () => {
    const onRefund = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} />);
    expect(screen.getByLabelText('Amount')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText(/Enter an amount in PKR/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Full PKR 5,100.00' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('5,100.00');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText('Choose a reason.')).toBeInTheDocument();
    expect(onRefund).not.toHaveBeenCalled();
  });

  it('refuses an amount with 3 decimals before calling the server (Plan 3 Review Focus 2)', async () => {
    const onRefund = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} />);
    await userEvent.type(screen.getByLabelText('Amount'), '1000.505');
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText(/at most 2 decimals/)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
    expect(onRefund).not.toHaveBeenCalled();
  });

  it('refuses more than is left', async () => {
    const onRefund = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={410000} onRefund={onRefund} />);
    await userEvent.type(screen.getByLabelText('Amount'), '5000');
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText('At most PKR 4,100.00 is left to refund.')).toBeInTheDocument();
    expect(onRefund).not.toHaveBeenCalled();
  });

  it('sends once, disables the button while sending, then reports done (Plan 3 Review Focus 5)', async () => {
    let finish!: (v: { ok: true }) => void;
    const onRefund = vi.fn(() => new Promise<{ ok: true }>((r) => (finish = r)));
    const onDone = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText('Amount'), '1,000');
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'requested_by_customer');
    const button = screen.getByRole('button', { name: 'Refund' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onRefund).toHaveBeenCalledTimes(1);
    expect(onRefund).toHaveBeenCalledWith('1,000', 'requested_by_customer');
    expect(screen.getByRole('button', { name: /Refunding/ })).toBeDisabled();
    finish({ ok: true });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("shows the project's currency", () => {
    render(<RefundForm currency="usd" amountLeft={29999} onRefund={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Full USD 299.99' })).toBeInTheDocument();
  });
});

describe('RefundDialog (S2)', () => {
  it('opens from a secondary Refund button with an empty amount, and Cancel closes it', async () => {
    render(<RefundDialog currency="pkr" amountLeft={510000} onRefund={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    const dialog = screen.getByRole('dialog', { name: 'Refund this payment' });
    expect(dialog).toHaveAccessibleDescription(/Up to PKR 5,100.00 left to refund/);
    expect(screen.getByLabelText('Amount')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Amount')).toBeNull();
  });
});

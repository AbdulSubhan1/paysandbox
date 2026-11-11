import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { RefundForm } = await import('./RefundForm');

describe('RefundForm (PS-RF-010)', () => {
  it('starts at the amount left and needs a reason', async () => {
    const onRefund = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} />);
    expect(screen.getByLabelText('Amount (max PKR 5,100.00)')).toHaveValue('5,100.00');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText('Choose a reason.')).toBeInTheDocument();
    expect(onRefund).not.toHaveBeenCalled();
  });

  it('refuses an amount with 3 decimals before calling the server (Plan 3 Review Focus 2)', async () => {
    const onRefund = vi.fn();
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} />);
    const amount = screen.getByLabelText('Amount (max PKR 5,100.00)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1000.505');
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(await screen.findByText(/at most 2 decimals/)).toBeInTheDocument();
    expect(onRefund).not.toHaveBeenCalled();
  });

  it('sends once and disables the button while sending (Plan 3 Review Focus 5)', async () => {
    let finish!: (v: { ok: true }) => void;
    const onRefund = vi.fn(() => new Promise<{ ok: true }>((r) => (finish = r)));
    render(<RefundForm currency="pkr" amountLeft={510000} onRefund={onRefund} />);
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'requested_by_customer');
    const button = screen.getByRole('button', { name: 'Refund' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(onRefund).toHaveBeenCalledTimes(1);
    expect(onRefund).toHaveBeenCalledWith('5,100.00', 'requested_by_customer');
    expect(screen.getByRole('button', { name: /Refunding/ })).toBeDisabled();
    finish({ ok: true });
  });

  it('follows the amount left after a partial refund (final review)', () => {
    const { rerender } = render(<RefundForm currency="pkr" amountLeft={510000} onRefund={vi.fn()} />);
    rerender(<RefundForm currency="pkr" amountLeft={410000} onRefund={vi.fn()} />);
    expect(screen.getByLabelText('Amount (max PKR 4,100.00)')).toHaveValue('4,100.00');
  });

  it("shows the project's currency", () => {
    render(<RefundForm currency="usd" amountLeft={29999} onRefund={vi.fn()} />);
    expect(screen.getByLabelText('Amount (max USD 299.99)')).toHaveValue('299.99');
  });
});

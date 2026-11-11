import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { DisputePanel } = await import('./DisputePanel');

const dispute = { amount: 410000, reason: 'product_not_received', respondBy: new Date('2026-11-18T10:00:00Z') };

describe('DisputePanel (PS-DP-003/004/006)', () => {
  it('shows what is on hold and when to respond', () => {
    render(<DisputePanel dispute={dispute} onClose={vi.fn()} />);
    expect(screen.getByText(/PKR 4,100.00 is on hold/)).toBeInTheDocument();
    expect(screen.getByText(/18 Nov 2026, 3:00 pm/)).toBeInTheDocument();
  });

  it('wins straight away', async () => {
    const onClose = vi.fn(async () => ({ ok: true as const }));
    render(<DisputePanel dispute={dispute} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit evidence and win' }));
    expect(onClose).toHaveBeenCalledWith('won');
  });

  it('asks before losing; Cancel does nothing', async () => {
    const onClose = vi.fn(async () => ({ ok: true as const }));
    render(<DisputePanel dispute={dispute} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept and lose' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Accept and lose' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(dialog.querySelector('[data-slot="alert-dialog-action"]')!);
    expect(onClose).toHaveBeenCalledWith('lost');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpDialog } from './OtpDialog';

const setup = () => {
  const onVerify = vi.fn();
  const onCancel = vi.fn();
  render(<OtpDialog open cardLast4="3220" amountLabel="PKR 5,100.00" merchantName="Chai Code Co." onVerify={onVerify} onCancel={onCancel} />);
  return { onVerify, onCancel };
};

describe('OtpDialog (PS-3DS-004/007)', () => {
  it('is a labelled dialog with the test OTP hint', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Confirm your payment' })).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('verifies with Enter once 6 digits are typed', async () => {
    const { onVerify } = setup();
    await userEvent.keyboard('123456{Enter}');
    expect(onVerify).toHaveBeenCalledWith('123456');
  });

  it('does not verify fewer than 6 digits', async () => {
    const { onVerify } = setup();
    await userEvent.keyboard('12345{Enter}');
    expect(onVerify).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('cancels on Escape', async () => {
    const { onCancel } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});

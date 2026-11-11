import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardNumberInput } from './CardNumberInput';

const setup = () => {
  const onChange = vi.fn();
  render(<CardNumberInput id="card" onChange={onChange} />);
  return { onChange, input: screen.getByLabelText('Card information') as HTMLInputElement };
};

describe('CardNumberInput', () => {
  it('formats a test card in groups of 4 and reports it complete (PS-CG-001)', async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, '4242424242424242');
    expect(input).toHaveValue('4242 4242 4242 4242');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'complete' }));
    expect(screen.getByText('VISA')).toBeInTheDocument();
  });

  it('clears a real-looking number after 4 digits and announces why (PS-CG-002, PS-CG-015)', async () => {
    const { onChange, input } = setup();
    await userEvent.type(input, '5398');
    expect(input).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith({ state: 'refused' });
    expect(input).toHaveAccessibleDescription(/isn't a PaySandbox test card/);
    expect(screen.getByText(/isn't a PaySandbox test card/).closest('[aria-live]')).toHaveAttribute('aria-live', 'assertive');
  });

  it('shows no error before 4 digits (PS-CG-003)', async () => {
    const { input } = setup();
    await userEvent.type(input, '539');
    expect(input).toHaveValue('539');
    expect(input).not.toHaveAccessibleDescription(/test card/);
  });

  it('turns the refusal off once a valid test card is typed', async () => {
    const { input } = setup();
    await userEvent.type(input, '5398');
    await userEvent.type(input, '4242');
    expect(input).not.toHaveAccessibleDescription(/test card/);
  });

  it('does not offer browser autofill', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });
});

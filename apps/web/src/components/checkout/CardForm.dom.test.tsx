import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardForm } from './CardForm';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const renderForm = () =>
  render(<CardForm sessionId="cs_test_1" amount={510000} currency="pkr" merchantName="Chai Code Co." defaultEmail="" />);

async function fillValid() {
  await userEvent.type(screen.getByLabelText('Email'), 'ayesha@example.com');
  await userEvent.click(screen.getByRole('button', { name: /4242 4242 4242 4242/ }));
  await userEvent.type(screen.getByLabelText(/Expiry/), '1229');
  await userEvent.type(screen.getByLabelText(/CVC/), '123');
  await userEvent.type(screen.getByLabelText('Name on card'), 'Ayesha Khan');
}

describe('CardForm', () => {
  it('shows every field error, focuses the first and sends nothing (PS-FV-001…007)', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /4242 4242 4242 4242/ }));
    await userEvent.type(screen.getByLabelText(/Expiry/), '0120');
    await userEvent.type(screen.getByLabelText(/CVC/), '12');
    await userEvent.click(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ }));
    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('This expiry date is in the past.')).toBeInTheDocument();
    expect(screen.getByText('Enter the 3-digit CVC from the back of the card.')).toBeInTheDocument();
    expect(screen.getByText('Enter the name on the card.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats the expiry as MM / YY while typing', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(/Expiry/), '1229');
    expect(screen.getByLabelText(/Expiry/)).toHaveValue('12 / 29');
  });

  it('posts once with an attempt id and never the CVC', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'succeeded', payment_id: 'pay_1', return_url: 'https://shop.test/thanks?pay=pay_1' }));
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/c/cs_test_1/pay');
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('cvc');
    expect(JSON.stringify(body)).not.toContain('123"');
    expect(body).toMatchObject({ attempt_id: expect.any(String), card_number: '4242424242424242', expiry: '12 / 29' });
    expect(await screen.findByRole('heading', { name: 'Payment successful' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Chai Code Co./ })).toHaveAttribute('href', 'https://shop.test/thanks?pay=pay_1');
  });

  it('shows a decline with its codes and lets the customer try another card', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        status: 'failed',
        payment_id: 'pay_1',
        failure: { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' },
      }),
    );
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ }));
    expect(await screen.findByRole('heading', { name: 'Payment declined' })).toBeInTheDocument();
    expect(screen.getByText('card_declined · insufficient_funds')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try another card' }));
    expect(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ })).toBeInTheDocument();
  });

  it('opens the OTP dialog for a 3-D Secure card', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'requires_action', payment_id: 'pay_1' }));
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ }));
    expect(await screen.findByRole('dialog', { name: 'Confirm your payment' })).toBeInTheDocument();
  });

  it('reuses the attempt id when retrying after a network failure (Review Focus 1)', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        Response.json({ status: 'failed', payment_id: 'pay_1', failure: { code: 'card_declined', decline_code: 'generic_decline', message: 'Your card was declined.' } }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'succeeded', payment_id: 'pay_2', return_url: 'https://shop.test/thanks?pay=pay_2' }));
    renderForm();
    await fillValid();
    const pay = () => userEvent.click(screen.getByRole('button', { name: /^Pay PKR 5,100.00$/ }));
    await pay();
    expect(await screen.findByText(/Could not reach PaySandbox/)).toBeInTheDocument();
    await pay();
    await userEvent.click(await screen.findByRole('button', { name: 'Try another card' }));
    await fillValid();
    await pay();
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).attempt_id);
    expect(ids[1]).toBe(ids[0]); // same click, retried
    expect(ids[2]).not.toBe(ids[1]); // a new attempt after a definite answer
  });
});

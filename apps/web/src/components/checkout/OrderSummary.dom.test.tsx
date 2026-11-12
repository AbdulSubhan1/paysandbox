import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderSummary } from './OrderSummary';

const renderSummary = (merchantName = 'Brokwise') =>
  render(
    <OrderSummary
      merchantName={merchantName}
      currency="usd"
      amount={32000}
      lineItems={[
        { name: 'Comprehensive cover', quantity: 1, amount: 30000 },
        { name: 'Roadside assistance', quantity: 1, amount: 0 },
        { name: 'Extra driver', quantity: 2, amount: 1000 },
      ]}
    />,
  );

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('OrderSummary', () => {
  it('hides "Qty 1" and keeps the quantity when there is more than one', () => {
    renderSummary();
    expect(within(row('Comprehensive cover')).queryByText(/Qty/)).not.toBeInTheDocument();
    expect(within(row('Extra driver')).getByText('Qty 2')).toBeInTheDocument();
    expect(within(row('Extra driver')).getByText('USD 20.00')).toBeInTheDocument();
  });

  it('shows "Included" for a free line and keeps the total', () => {
    renderSummary();
    expect(within(row('Roadside assistance')).getByText('Included')).toBeInTheDocument();
    expect(screen.queryByText('USD 0.00')).not.toBeInTheDocument();
    expect(within(row('Total due')).getByText('USD 320.00')).toBeInTheDocument();
  });

  it('uppercases the merchant initial however the name is stored', () => {
    renderSummary('brokwise');
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getAllByText('brokwise')).not.toHaveLength(0);
  });
});

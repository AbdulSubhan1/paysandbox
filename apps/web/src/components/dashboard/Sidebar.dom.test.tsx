import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('lists the pages in the mockup order, with a Developers group', () => {
    render(<Sidebar merchantId="mer_1" current="payments" />);
    const nav = screen.getByRole('navigation', { name: 'Project' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/dashboard/mer_1'],
      ['Payments', '/dashboard/mer_1/payments'],
      ['Customers', '/dashboard/mer_1/customers'],
      ['Disputes', '/dashboard/mer_1/disputes'],
      ['Test cards', '/dashboard/mer_1/test-cards'],
      ['API keys & code', '/dashboard/mer_1/developers'],
      ['Webhooks', '/dashboard/mer_1/webhooks'],
      ['API request log', '/dashboard/mer_1/logs'],
    ]);
    expect(within(nav).getByText('Developers')).toBeInTheDocument();
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['Payments']);
  });
});

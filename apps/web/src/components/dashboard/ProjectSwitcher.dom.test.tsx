import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let pathname = '';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
const { ProjectSwitcher } = await import('./ProjectSwitcher');

const projects = [
  { id: 'mer_A', name: 'Shop A' },
  { id: 'mer_B', name: 'Shop B' },
];

describe('ProjectSwitcher (final review)', () => {
  it.each([
    ['/dashboard/mer_A/payments/pay_x', '/dashboard/mer_B/payments'],
    ['/dashboard/mer_A/webhooks/evt_1', '/dashboard/mer_B/webhooks'],
    ['/dashboard/mer_A/customers', '/dashboard/mer_B/customers'],
    ['/dashboard/mer_A', '/dashboard/mer_B'],
  ])('from %s goes to %s, never to the other project with this one’s ids', async (from, to) => {
    pathname = from;
    push.mockClear();
    render(<ProjectSwitcher current="mer_A" projects={projects} />);
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'mer_B');
    expect(push).toHaveBeenCalledWith(to);
  });
});

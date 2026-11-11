import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['succeeded', 'Succeeded'],
    ['partially_refunded', 'Partially refunded'],
    ['refunded', 'Refunded'],
    ['failed', 'Failed'],
    ['requires_action', 'Needs OTP'],
    ['disputed', 'Disputed'],
    ['dispute_lost', 'Dispute lost'],
  ] as const)('%s reads "%s"', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['succeeded', 'Succeeded'],
    ['partially_refunded', 'Partly refunded'],
    ['refunded', 'Refunded'],
    ['failed', 'Declined'],
    ['requires_action', 'Waiting for OTP'],
    ['disputed', 'Disputed'],
    ['dispute_lost', 'Dispute lost'],
  ] as const)('%s reads "%s"', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

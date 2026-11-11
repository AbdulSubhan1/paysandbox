import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeliveryAttempts } from './DeliveryAttempts';

const attempt = {
  id: 'att_1',
  attempt: 1,
  url: 'https://hooks.example.com/ps',
  statusCode: 500,
  error: null,
  durationMs: 120,
  responseSnippet: '<script>alert(1)</script><b>x</b>',
  requestHeaders: { 'webhook-id': 'evt_1', 'webhook-signature': 'v1,abc=', 'content-type': 'application/json' },
  attemptedAt: new Date('2026-11-11T13:51:00Z'),
};

describe('DeliveryAttempts (Plan 3 Review Focus 4)', () => {
  it('shows the receiver response as text, never as markup, and no secret', () => {
    const { container } = render(<DeliveryAttempts attempts={[attempt]} />);
    expect(screen.getByText('<script>alert(1)</script><b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('script, b')).toBeNull();
    expect(container.textContent).toContain('webhook-signature');
    expect(container.textContent).not.toContain('whsec_');
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.getByText(/11 Nov 2026, 6:51 pm/)).toBeInTheDocument();
  });

  it('names a timeout or a blocked address when there is no status code', () => {
    render(<DeliveryAttempts attempts={[{ ...attempt, statusCode: null, error: 'timeout', responseSnippet: null }]} />);
    expect(screen.getByText(/Timed out/)).toBeInTheDocument();
  });
});

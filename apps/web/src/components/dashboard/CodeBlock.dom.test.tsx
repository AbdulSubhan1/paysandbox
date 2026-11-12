import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { CodeBlock } = await import('./CodeBlock');

describe('CodeBlock', () => {
  it('switches tabs and copies the active one', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeBlock tabs={[{ label: 'curl', code: 'curl https://x' }, { label: 'Next.js', code: 'export async function POST() {}' }]} />);
    expect(screen.getByText('curl https://x')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Next.js' }));
    expect(screen.getByRole('tab', { name: 'Next.js' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('export async function POST() {}')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('export async function POST() {}');
  });
});

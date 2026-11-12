import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog';
import { Button, buttonVariants } from './button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './input-otp';
import { toast, Toaster } from './toast';

describe('own UI kit', () => {
  it('cn joins and skips falsy parts; buttonVariants adds className without dropping its own classes', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })).toMatch(/border-border .* h-7 .* self-start$/);
  });

  it('a Button never submits a form unless asked to', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
  });

  it('Dialog opens from its trigger, is labelled and described, and Escape closes it once and returns focus', async () => {
    const onOpenChange = vi.fn();
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            onOpenChange(o);
            setOpen(o);
          }}
        >
          <DialogTrigger render={<Button />}>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Your secret key</DialogTitle>
            <DialogDescription>Copy it now.</DialogDescription>
            <input aria-label="Key" />
          </DialogContent>
        </Dialog>
      );
    }
    render(<Demo />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Your secret key' });
    expect(dialog).toHaveAccessibleDescription('Copy it now.');
    expect(screen.getByLabelText('Key')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByLabelText('Key')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('AlertDialog is an alertdialog and Cancel closes it', async () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="danger" />}>Roll</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Roll the key?</AlertDialogTitle>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(screen.getByRole('alertdialog', { name: 'Roll the key?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Roll the key?' })).toBeNull();
  });

  it('InputOTP takes a pasted code and draws one digit per slot', async () => {
    function Demo() {
      const [code, setCode] = useState('');
      return (
        <InputOTP maxLength={6} value={code} onChange={setCode} aria-label="One-time code">
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      );
    }
    const { container } = render(<Demo />);
    await userEvent.click(screen.getByLabelText('One-time code'));
    await userEvent.paste('1234567');
    expect(screen.getByLabelText('One-time code')).toHaveValue('123456');
    expect([...container.querySelectorAll('[data-slot=input-otp-slot]')].map((s) => s.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('toasts appear in a polite live region and can be closed', async () => {
    render(<Toaster />);
    act(() => toast.success('Endpoint saved', { description: 'All good.' }));
    const live = screen.getByRole('region', { name: 'Notifications' }).querySelector('[aria-live=polite]');
    expect(live).toHaveTextContent('Endpoint savedAll good.');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Endpoint saved')).toBeNull();
  });
});

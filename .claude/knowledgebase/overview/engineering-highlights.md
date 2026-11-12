# Engineering highlights

Decisions worth knowing when reading the code, newest first.

## Overview numbers that always add up, and "Showing a–b of n" on keyset pages (2026-11-12)
- **One date per payment.** The overview counts money by the day the payment was made. A refund or lost dispute that comes later counts against that payment, so for any range Net volume = Successful payments − Refunded and disputed, exactly. The sums and the "add up" check are pure functions (`moneyTotals`, `dailySeries` in `lib/dashboard/overview.ts`) with their own tests.
- **Karachi days in SQL, whatever the server's time zone.** Daily bars group by `to_char((created_at at time zone 'UTC') + interval '5 hours', 'YYYY-MM-DD')`. Pakistan has no daylight saving, so a fixed offset is exact. It also matches `lib/time.ts`.
- **Positions without offsets.** The payments list keeps keyset paging, which stays stable while new payments arrive. One extra `count(*) filter (where …)` query counts the matching rows ahead of the page, which gives "Showing 26–50 of 312". Previous uses an `after` cursor: fetch the rows just newer than the page in ascending order, then reverse them.
- **Search is text, not a pattern.** `%`, `_` and `\` are escaped before `ILIKE`, and a whole `pay_` id is an exact match.
- **Phone layouts without JavaScript.** On the checkout, the folded order summary is a native `<details>`. The result screen hides the summary with a CSS `:has()` group variant, so no client state was added.

## Own UI kit, no component library (2026-11-12)
The interface is built from PaySandbox's own components in `apps/web/src/components/ui`, not shadcn/ui or Base UI.

- **Dialogs** use the browser's native `<dialog>` opened with `showModal()`: the page behind becomes inert, focus stays inside, Escape closes and focus goes back to the button that opened it. A confirm dialog (`AlertDialog`) has `role="alertdialog"` and does not close on a backdrop click.
- **Toasts** are a few dozen lines: a small store outside React (`toast.success(...)` works from any click handler) and one `Toaster` that shows them in a polite live region, bottom right.
- **The one-time code box** is one real `<input>` laid over six drawn boxes, so typing, paste, phone autofill and screen readers all behave like a normal field.
- **Buttons** get their look from `buttonVariants({ variant, size })`. Classes are only joined, never merged (`lib/utils.ts`), so a component that needs another look gets a variant or size rather than an override.
- **Icons** are a handful of inline SVG paths in `icon.tsx`.

Why: fewer packages to keep up to date, a smaller page, and every piece of UI behaviour is code we can read and test. Eight packages were removed: `@base-ui/react`, `class-variance-authority`, `cn`, `shadcn`, `tw-animate-css`, `input-otp`, `sonner`, `lucide-react`.

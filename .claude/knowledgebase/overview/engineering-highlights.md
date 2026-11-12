# Engineering highlights

Decisions worth knowing when reading the code, newest first.

## Own UI kit, no component library (2026-11-12)
The interface is built from PaySandbox's own components in `apps/web/src/components/ui`, not shadcn/ui or Base UI.

- **Dialogs** use the browser's native `<dialog>` opened with `showModal()`: the page behind becomes inert, focus stays inside, Escape closes and focus goes back to the button that opened it. A confirm dialog (`AlertDialog`) has `role="alertdialog"` and does not close on a backdrop click.
- **Toasts** are a few dozen lines: a small store outside React (`toast.success(...)` works from any click handler) and one `Toaster` that shows them in a polite live region, bottom right.
- **The one-time code box** is one real `<input>` laid over six drawn boxes, so typing, paste, phone autofill and screen readers all behave like a normal field.
- **Buttons** get their look from `buttonVariants({ variant, size })`. Classes are only joined, never merged (`lib/utils.ts`), so a component that needs another look gets a variant or size rather than an override.
- **Icons** are a handful of inline SVG paths in `icon.tsx`.

Why: fewer packages to keep up to date, a smaller page, and every piece of UI behaviour is code we can read and test. Eight packages were removed: `@base-ui/react`, `class-variance-authority`, `cn`, `shadcn`, `tw-animate-css`, `input-otp`, `sonner`, `lucide-react`.

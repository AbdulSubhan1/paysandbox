/** Added by PaySandbox to every checkout page. Nothing a merchant sends can change or hide it. */
export function TestModeBanner() {
  return (
    <div
      role="note"
      className="sticky top-0 z-40 flex h-9 items-center justify-center bg-[repeating-linear-gradient(-45deg,var(--hazard)_0_14px,#1d1b17_14px_28px)]"
    >
      <span className="rounded border-2 border-[#1d1b17] bg-hazard px-3 py-0.5 text-xs font-bold uppercase tracking-widest text-[#1d1b17]">
        TEST MODE · no real payments
      </span>
    </div>
  );
}

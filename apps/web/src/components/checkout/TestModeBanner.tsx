/** Added by PaySandbox to every checkout page. Nothing a merchant sends can change or hide it. */
export function TestModeBanner() {
  const stripes = <span aria-hidden className="h-2 w-7 rounded-xs bg-[repeating-linear-gradient(-45deg,var(--hazard)_0_5px,#1d1b17_5px_10px)] md:w-10" />;
  return (
    <div
      role="note"
      className="sticky top-0 z-40 flex h-7 items-center justify-center gap-2.5 bg-[#1d1b17] text-xs font-semibold tracking-wide text-[#f6e3b4] md:text-[13px]"
    >
      {stripes}
      TEST MODE · no real money moves
      {stripes}
    </div>
  );
}

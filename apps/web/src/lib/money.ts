const PKR = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats an integer amount of paisa as `PKR 1,234.56`. */
export function formatPkr(paisa: number): string {
  if (!Number.isSafeInteger(paisa)) throw new TypeError(`paisa must be a safe integer, got ${paisa}`);
  return `PKR ${PKR.format(paisa / 100)}`;
}

// Shared number/currency formatting -- every screen that renders a
// currency-typed field value should go through this instead of a one-off
// `String(value)` or its own toLocaleString call, so "$850,000" (not
// "850000") is the app-wide default rather than something each screen
// remembers to opt into.
export function formatCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Pure apportionment math for CreateInvoiceModal's fee adjustment panel --
// no I/O, no Supabase calls. Every mode in the modal (discount/markup by %,
// discount/markup by a flat $ amount, target a fixed fee total spread across
// all fees) reduces to scaleToTarget with a different computed target;
// "target a fixed fee total, spread across just the largest line(s))"
// reduces to the same function scoped to a subset -- see
// applyToSelectedLines. Only fee lines ever go through these; disbursements
// are always billed at their original amount (see CreateInvoiceModal.tsx).

export interface ApportionLine {
  id: string; // source_record_id
  amount: number; // original amount
}

export interface ApportionedLine {
  id: string;
  originalAmount: number;
  billedAmount: number;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

// Forces the LAST line in `results` to absorb whatever rounding residual is
// left after every other line was rounded to the cent independently -- the
// standard fix so a proportional split always sums to targetTotal exactly,
// never a cent or two off.
function applyResidual(results: ApportionedLine[], targetTotal: number): void {
  if (results.length === 0) return;
  const sumExceptLast = results.slice(0, -1).reduce((s, r) => s + r.billedAmount, 0);
  results[results.length - 1].billedAmount = roundCents(targetTotal - sumExceptLast);
}

// Scales every line proportionally so the group's new total is exactly
// targetTotal. Used directly for "target a fixed fee total, spread across
// all fees" and, via applyPercentOrAmount, for the %/$ discount-markup mode.
export function scaleToTarget(lines: ApportionLine[], targetTotal: number): ApportionedLine[] {
  if (lines.length === 0) return [];
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const results: ApportionedLine[] = sum === 0
    // Nothing to scale proportionally from zero -- split the target evenly instead.
    ? lines.map(l => ({ id: l.id, originalAmount: l.amount, billedAmount: roundCents(targetTotal / lines.length) }))
    : lines.map(l => ({ id: l.id, originalAmount: l.amount, billedAmount: roundCents(l.amount * (targetTotal / sum)) }));
  applyResidual(results, targetTotal);
  return results;
}

// "Target a fixed fee total, spread across the largest line(s)" -- every
// unselected line stays at its original amount; the whole delta needed to
// reach targetTotal is distributed proportionally across ONLY the selected
// subset (selecting just one line is the single-largest-line case; checking
// more just widens the subset the same delta spreads across -- not a
// separate algorithm). Preserves `allLines`' original order in the result.
export function applyToSelectedLines(
  allLines: ApportionLine[], selectedLineIds: string[], targetTotal: number
): ApportionedLine[] {
  const selectedSet = new Set(selectedLineIds);
  const selected = allLines.filter(l => selectedSet.has(l.id));
  const unselected = allLines.filter(l => !selectedSet.has(l.id));
  const unselectedSum = unselected.reduce((s, l) => s + l.amount, 0);

  const selectedResults = scaleToTarget(selected, targetTotal - unselectedSum);
  const unselectedResults: ApportionedLine[] = unselected.map(l => ({ id: l.id, originalAmount: l.amount, billedAmount: l.amount }));

  const byId = new Map([...selectedResults, ...unselectedResults].map(r => [r.id, r]));
  return allLines.map(l => byId.get(l.id)!);
}

// "Discount/markup all fees by %/$" -- both reduce to a target total fed
// into scaleToTarget: percent computes the delta off the current sum, a flat
// $ amount IS the delta directly.
export function applyPercentOrAmount(
  lines: ApportionLine[],
  opts: { mode: 'percent' | 'amount'; direction: 'discount' | 'markup'; value: number }
): ApportionedLine[] {
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const delta = opts.mode === 'percent' ? sum * (opts.value / 100) : opts.value;
  const signedDelta = opts.direction === 'discount' ? -delta : delta;
  return scaleToTarget(lines, sum + signedDelta);
}

// Total original-vs-billed delta across a set of already-apportioned lines
// -- what generateInvoicePdf.ts prints as "Fee discount/markup applied".
// Positive = net discount (billed less than original); negative = net markup.
export function totalDiscount(results: ApportionedLine[]): number {
  return roundCents(results.reduce((s, r) => s + (r.originalAmount - r.billedAmount), 0));
}

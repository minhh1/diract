// lib/costs/stripe.ts
// Stripe itself is a revenue processor, not a cost -- what we actually pay
// Stripe is its processing fee, deducted per balance transaction. Sums the
// `fee` field across this month's balance transactions.
import { getStripe } from "@/lib/stripe";
import type { CostSnapshot } from "./types";

export async function fetchStripeFeesCost(): Promise<CostSnapshot> {
  const stripe = getStripe();
  const now = new Date();
  const periodStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStartUnix = Math.floor(periodStartDate.getTime() / 1000);

  let totalFeeCents = 0;
  let startingAfter: string | undefined;
  // Cap pagination -- a runaway loop here shouldn't be possible (balance
  // transactions for one company's usage), but bound it defensively anyway.
  for (let page = 0; page < 20; page++) {
    const list = await stripe.balanceTransactions.list({
      created: { gte: periodStartUnix },
      limit: 100,
      starting_after: startingAfter,
    });
    for (const txn of list.data) totalFeeCents += txn.fee;
    if (!list.has_more) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return {
    amountUsd: totalFeeCents / 100,
    periodStart: periodStartDate.toISOString().slice(0, 10),
    periodEnd: now.toISOString().slice(0, 10),
  };
}

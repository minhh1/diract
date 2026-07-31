// lib/financeModel/classifyTransaction.ts
// Pure matching logic for the Transactions subtab's "Apply rules" bulk
// action -- deliberately plain application code, not a DB trigger. These
// rules are user-authored (entered by whoever manages a project's Finance
// Model), and the existing auto_fed_rules SQL-trigger engine
// (supabase/migrations/20260729150000_auto_fed_rule_engine.sql) is
// explicitly developer-config-only (its condition_sql is raw trusted SQL,
// never meant to be end-user-editable) -- not a fit here.

export interface ClassificationRule {
  id: string;
  project: string | null; // null = applies to every project in the company
  match_field: "Contact" | "Reference" | null;
  match_type: "Equals" | "Contains" | "Starts With" | null;
  match_value: string | null;
  budget_line: string | null;
  display_order: number | null;
  is_active: boolean | null;
}

export interface ClassifiableTransaction {
  project: string;
  contact: string | null;
  reference: string | null;
}

function fieldValue(tx: ClassifiableTransaction, field: ClassificationRule["match_field"]): string {
  return (field === "Contact" ? tx.contact : tx.reference) || "";
}

function isMatch(value: string, matchType: ClassificationRule["match_type"], matchValue: string): boolean {
  const v = value.toLowerCase();
  const m = matchValue.toLowerCase();
  if (!m) return false;
  switch (matchType) {
    case "Equals": return v === m;
    case "Contains": return v.includes(m);
    case "Starts With": return v.startsWith(m);
    default: return false;
  }
}

// First active rule (in display_order) that applies to this transaction's
// project (project-specific rules take priority over company-wide ones at
// the same display_order, since a project owner's own rule should win over
// a generic default) and whose condition matches -- returns the budget_line
// id to classify the transaction to, or null if nothing matched.
export function classifyTransaction(tx: ClassifiableTransaction, rules: ClassificationRule[]): string | null {
  const applicable = rules
    .filter(r => r.is_active !== false && r.budget_line && (r.project === null || r.project === tx.project))
    .sort((a, b) => {
      const order = (a.display_order ?? 0) - (b.display_order ?? 0);
      if (order !== 0) return order;
      return (a.project === null ? 1 : 0) - (b.project === null ? 1 : 0);
    });

  for (const rule of applicable) {
    if (!rule.match_field || !rule.match_type || !rule.match_value) continue;
    if (isMatch(fieldValue(tx, rule.match_field), rule.match_type, rule.match_value)) return rule.budget_line;
  }
  return null;
}

// lib/financeModel/data.ts
// Project-scoped Finance Model data loading -- replaces
// lib/xero/financeModelData.ts (entity-scoped, deleted). A project's Xero
// connection (if any) is resolved by walking project -> property ->
// holding entity -> entities.xero_connection_id, since Xero orgs are still
// linked at the entity level (one SPV company can hold several projects,
// e.g. two units on the same title), but the Finance Model itself is now
// per-project. Xero is optional here -- callers don't need a connection to
// use budget lines/transactions, unlike the old entity-scoped version
// which blocked the whole tab on a Xero error.
import { getCustomTable, listCustomTableRows, type CustomTableRef } from "@/lib/customTableAdmin";

export const BUDGET_LINES_SLUG = "finance-model-budget-lines";
export const TRANSACTIONS_SLUG = "finance-model-transactions";
export const CLASSIFICATION_RULES_SLUG = "finance-model-classification-rules";
export const LOANS_SLUG = "finance-model-loans";
export const LOAN_INTEREST_RATES_SLUG = "finance-model-loan-interest-rates";
export const LOAN_PHASES_SLUG = "finance-model-loan-phases";

export interface XeroConnectionInfo {
  connectionId: string;
  entityId: string;
  tenantName: string | null;
}

// project -> properties.id (via project.property_id) -> properties.holding_entity_id
// -> entities.xero_connection_id -> company_xero_connections. Returns null
// at any missing link (no property, no holding entity, or no Xero
// connection on that entity) -- all are normal, expected states, not errors.
export async function resolveProjectXeroConnection(admin: any, projectId: string): Promise<XeroConnectionInfo | null> {
  const { data: project } = await admin.from("projects").select("property_id").eq("id", projectId).maybeSingle();
  if (!project?.property_id) return null;

  const { data: property } = await admin.from("properties").select("holding_entity_id").eq("id", project.property_id).maybeSingle();
  if (!property?.holding_entity_id) return null;

  const { data: entity } = await admin
    .from("entities")
    .select("id, xero_connection_id, connection:company_xero_connections(id, tenant_name)")
    .eq("id", property.holding_entity_id)
    .maybeSingle();
  if (!entity?.xero_connection_id) return null;

  return { connectionId: entity.xero_connection_id, entityId: entity.id, tenantName: (entity as any).connection?.tenant_name ?? null };
}

export interface ProjectPropertyInfo {
  id: string;
  street_address: string;
  state: string | null;
  purchase_price: number | null;
}

export async function loadProjectProperty(admin: any, projectId: string): Promise<ProjectPropertyInfo | null> {
  const { data: project } = await admin.from("projects").select("property_id").eq("id", projectId).maybeSingle();
  if (!project?.property_id) return null;
  const { data: property } = await admin
    .from("properties")
    .select("id, street_address, state, purchase_price")
    .eq("id", project.property_id)
    .is("deleted_at", null)
    .maybeSingle();
  return property || null;
}

export interface BudgetLineRow {
  id: string;
  category: string | null;
  label: string | null;
  budgeted_amount: number | null;
  xero_account_code: string | null;
  display_order: number | null;
  actual: number | null;
}

export interface OverviewData {
  budgetLines: BudgetLineRow[];
  property: ProjectPropertyInfo | null;
  connected: boolean;
  tenantName: string | null;
}

async function getFinanceModelTable(admin: any, companyId: string, slug: string): Promise<CustomTableRef> {
  const table = await getCustomTable(admin, companyId, slug);
  if (!table) throw new Error(`Finance Model custom table "${slug}" is not provisioned for this company`);
  return table;
}

export async function loadOverview(admin: any, companyId: string, projectId: string): Promise<OverviewData> {
  const [budgetTable, txTable, property, xero] = await Promise.all([
    getFinanceModelTable(admin, companyId, BUDGET_LINES_SLUG),
    getFinanceModelTable(admin, companyId, TRANSACTIONS_SLUG),
    loadProjectProperty(admin, projectId),
    resolveProjectXeroConnection(admin, projectId),
  ]);

  const [budgetRows, txRows] = await Promise.all([
    listCustomTableRows(admin, budgetTable, "project", projectId),
    listCustomTableRows(admin, txTable, "project", projectId),
  ]);

  // A budget line's "actual" is the sum of every transaction classified to
  // it, regardless of Income/Expense -- a line is coded to one direction of
  // money movement in practice (you wouldn't code both a receipt and a
  // payment to a "Stamp Duty" line), so a plain magnitude sum is a positive
  // "actual spent/received" comparable to the line's positive
  // budgeted_amount either way.
  const actualByLine = new Map<string, number>();
  for (const tx of txRows) {
    if (!tx.budget_line) continue;
    const amt = Math.abs(Number(tx.amount) || 0);
    actualByLine.set(tx.budget_line, (actualByLine.get(tx.budget_line) || 0) + amt);
  }

  const budgetLines: BudgetLineRow[] = budgetRows
    .map(r => ({
      id: r.id,
      category: r.category ?? null,
      label: r.label ?? null,
      budgeted_amount: r.budgeted_amount != null ? Number(r.budgeted_amount) : null,
      xero_account_code: r.xero_account_code ?? null,
      display_order: r.display_order != null ? Number(r.display_order) : null,
      actual: actualByLine.has(r.id) ? actualByLine.get(r.id)! : null,
    }))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  return { budgetLines, property, connected: !!xero, tenantName: xero?.tenantName ?? null };
}

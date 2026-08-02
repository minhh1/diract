// lib/vmProviders/allowedCompany.ts
// The virtual-computers feature is being wound down company-wide (the
// shared Guacamole gateway fleet was stopped alongside this) -- every VM
// ever created already belongs to this company anyway (confirmed against
// live data, every row destroyed), so this is a no-op for existing usage
// and just closes off the feature for every other company going forward.
// Deliberately a single hardcoded id rather than a DB-configurable flag --
// this is a one-off wind-down decision, not a per-company entitlement this
// app otherwise has any concept of. Framework-agnostic (no server-only
// imports) so both the API routes (app/api/virtual-computers/_lib.ts) and
// client components (components/Sidebar.tsx, the dashboard pages) can share
// the exact same id.
export const VIRTUAL_COMPUTERS_ALLOWED_COMPANY_ID = "a49b484d-100d-4c3e-b3b6-69c1a18cc783"; // Huynh Lawyers

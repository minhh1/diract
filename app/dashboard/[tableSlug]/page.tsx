"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { useCompany } from "@/components/CompanyContext";
import { useCustomTables } from "@/lib/hooks/useCustomTables";
import CustomTableMasterPage from "@/components/CustomTableMasterPage";
import DashboardViewPage from "@/components/dashboard/DashboardViewPage";

// A single slug segment is shared between custom tables and dashboards (no
// separate URL namespace for either) -- so this checks which one the slug
// actually belongs to and renders that. Custom tables win on a collision
// since they were here first; a dashboard slug is auto-generated with a
// timestamp suffix (see DashboardBuilderPage) so a real collision is very
// unlikely.
function TableOrDashboardPageInner() {
  const params = useParams();
  const slug = params.tableSlug as string;
  // Pass the already-resolved userId (CompanyContext sits above this page
  // and has it synchronously by the time you're navigating around the app)
  // instead of leaving useCustomTables() to re-resolve it itself -- omitting
  // it defeated that hook's own warm-cache lazy state entirely (it only
  // trusts the cache when it already knows which user it's for), so this
  // page blank-rendered AND fired a real supabase.auth.getUser() round trip
  // on literally every single navigation to any table or dashboard, even
  // though the tables list was already sitting warm in the module cache.
  const { userId } = useCompany();
  const { tables, loading } = useCustomTables(userId);

  if (loading) return null;

  const isCustomTable = tables.some(t => t.slug === slug);
  return isCustomTable
    ? <CustomTableMasterPage tableSlug={slug} />
    : <DashboardViewPage slug={slug} />;
}

export default function TableOrDashboardPage() {
  return (
    <Suspense fallback={null}>
      <TableOrDashboardPageInner />
    </Suspense>
  );
}

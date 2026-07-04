// app/dashboard/entities/page.tsx
"use client";

import GenericMasterTable from "@/components/GenericMasterTable";
import EntityDashboard from "./EntityDashboard";

export const dynamic = "force-dynamic";

export default function EntitiesPage() {
  return (
    <GenericMasterTable
      tableName="entities"
      pageTitle="Entities"
      newButtonLabel="+ New entity"
      renderDashboard={(id, onBack) => (
        <EntityDashboard entityId={id} onBack={onBack} />
      )}
    />
  );
}
// app/dashboard/properties/page.tsx
"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function PropertiesPage() {
  return (
    <GenericMasterTable
      tableName="entities"
      pageTitle="Entities"
      newButtonLabel="+ New Entity"
      renderDashboard={(id, onBack) => (
        <RecordDashboard systemTable="entities" recordId={id} onBack={onBack} />
      )}
    />
  );
}
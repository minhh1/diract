// app/dashboard/properties/page.tsx
"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function PropertiesPage() {
  return (
    <GenericMasterTable
      tableName="properties"
      pageTitle="Properties"
      newButtonLabel="+ New property"
      renderDashboard={(id, onBack) => (
        <RecordDashboard systemTable="properties" recordId={id} onBack={onBack} />
      )}
    />
  );
}
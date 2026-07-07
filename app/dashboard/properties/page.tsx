// app/dashboard/properties/page.tsx
"use client";

import GenericMasterTable from "@/components/GenericMasterTable";
import GenericRecordDashboard from "@/components/GenericRecordDashboard";

export default function PropertiesPage() {
  return (
    <GenericMasterTable
      tableName="properties"
      pageTitle="Properties"
      newButtonLabel="+ New property"
      renderDashboard={(id, onBack) => (
        <GenericRecordDashboard
          systemTable="properties"
          recordId={id}
          companyId=""
          onBack={onBack}
        />
      )}
    />
  );
}
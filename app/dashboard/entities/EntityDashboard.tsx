// app/dashboard/entities/page.tsx
"use client";

import GenericMasterTable from "@/components/GenericMasterTable";
import GenericRecordDashboard from "@/components/GenericRecordDashboard";

export default function EntitiesPage() {
  return (
    <GenericMasterTable
      tableName="entities"
      pageTitle="Entities"
      newButtonLabel="+ New entity"
      renderDashboard={(id, onBack) => (
        <GenericRecordDashboard
          systemTable="entities"
          recordId={id}
          companyId=""
          onBack={onBack}
        />
      )}
    />
  );
}
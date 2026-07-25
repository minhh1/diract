"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import DeletedSystemTableGuard from "@/components/DeletedSystemTableGuard";

export default function EntitiesPage() {
  return (
    <DeletedSystemTableGuard slug="entities" label="Entities">
      <GenericMasterTable
        tableName="entities"
        pageTitle="Entities"
        newButtonLabel="+ New entity"
        renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
          <RecordDashboard systemTable="entities" recordId={id} onBack={onBack} initialRecord={initialRecord} />
        )}
      />
    </DeletedSystemTableGuard>
  );
}
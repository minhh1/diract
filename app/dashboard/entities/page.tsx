"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function EntitiesPage() {
  return (
    <GenericMasterTable
      tableName="entities"
      pageTitle="Entities"
      newButtonLabel="+ New entity"
      renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
        <RecordDashboard systemTable="entities" recordId={id} onBack={onBack} initialRecord={initialRecord} />
      )}
    />
  );
}
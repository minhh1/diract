"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import DeletedSystemTableGuard from "@/components/DeletedSystemTableGuard";

export default function ProjectsPage() {
  return (
    <DeletedSystemTableGuard slug="properties" label="Properties">
      <GenericMasterTable
        tableName="properties"
        pageTitle="Properties"
        newButtonLabel="+ New property"
        renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
          <RecordDashboard systemTable="properties" recordId={id} onBack={onBack} initialRecord={initialRecord} />
        )}
      />
    </DeletedSystemTableGuard>
  );
}
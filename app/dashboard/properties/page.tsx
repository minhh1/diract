"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function ProjectsPage() {
  return (
    <GenericMasterTable
      tableName="properties"
      pageTitle="Properties"
      newButtonLabel="+ New property"
      renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
        <RecordDashboard systemTable="properties" recordId={id} onBack={onBack} initialRecord={initialRecord} />
      )}
    />
  );
}
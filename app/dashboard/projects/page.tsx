"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function PropertiesPage() {
  return (
    <GenericMasterTable
      tableName="projects"
      pageTitle="Projects"
      newButtonLabel="+ New Projects"
      renderDashboard={(id, onBack) => (
        <RecordDashboard systemTable="projects" recordId={id} onBack={onBack} />
      )}
    />
  );
}
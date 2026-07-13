"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";

export default function ProjectsPage() {
  return (
    <GenericMasterTable
      tableName="projects"
      pageTitle="Projects"
      newButtonLabel="+ New project"
      renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
        <RecordDashboard systemTable="projects" recordId={id} onBack={onBack} initialRecord={initialRecord} />
      )}
    />
  );
}
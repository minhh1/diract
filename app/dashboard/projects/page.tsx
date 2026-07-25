"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import DeletedSystemTableGuard from "@/components/DeletedSystemTableGuard";

export default function ProjectsPage() {
  return (
    <DeletedSystemTableGuard slug="projects" label="Projects">
      <GenericMasterTable
        tableName="projects"
        pageTitle="Projects"
        newButtonLabel="+ New project"
        renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
          <RecordDashboard systemTable="projects" recordId={id} onBack={onBack} initialRecord={initialRecord} />
        )}
      />
    </DeletedSystemTableGuard>
  );
}
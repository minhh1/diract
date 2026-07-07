"use client";

import GenericMasterTable from "@/components/GenericMasterTable";
import GenericRecordDashboard from "@/components/GenericRecordDashboard";

export default function ProjectsPage() {
  return (
    <GenericMasterTable
      tableName="projects"
      pageTitle="Projects"
      newButtonLabel="+ New project"
      renderDashboard={(id, onBack) => (
        <GenericRecordDashboard
          systemTable="projects"
          recordId={id}
          companyId=""
          onBack={onBack}
        />
      )}
    />
  );
}
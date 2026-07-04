// app/dashboard/projects/page.tsx
"use client";

import GenericMasterTable from "@/components/GenericMasterTable";
import ProjectDashboard from "./ProjectDashboard";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  return (
    <GenericMasterTable
      tableName="projects"
      pageTitle="Projects"
      newButtonLabel="+ New project"
      renderDashboard={(id, onBack) => (
        <ProjectDashboard projectId={id} onBack={onBack} />
      )}
    />
  );
}
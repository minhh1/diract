"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import DeletedSystemTableGuard from "@/components/DeletedSystemTableGuard";

export default function TasksPage() {
  return (
    <DeletedSystemTableGuard slug="tasks" label="Tasks">
      <GenericMasterTable
        tableName="tasks"
        pageTitle="Tasks"
        newButtonLabel="+ New task"
        renderDashboard={(id: string, onBack: () => void, initialRecord?: any) => (
          <RecordDashboard systemTable="tasks" recordId={id} onBack={onBack} initialRecord={initialRecord} />
        )}
      />
    </DeletedSystemTableGuard>
  );
}

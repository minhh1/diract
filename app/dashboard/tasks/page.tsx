"use client";
import dynamic from "next/dynamic";
import GenericMasterTable from "@/components/GenericMasterTable";
import DeletedSystemTableGuard from "@/components/DeletedSystemTableGuard";

// Deferred: only needed once a record is opened, not for the list view
// itself -- keeps the table's own first-load JS off RecordDashboard's
// ~1300 lines (plus its own tab components).
const RecordDashboard = dynamic(() => import("@/components/dashboard/RecordDashboard"));

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

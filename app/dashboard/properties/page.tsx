// app/dashboard/properties/page.tsx
"use client";
import GenericMasterTable from "@/components/GenericMasterTable";
import PropertyDashboard from "./PropertyDashboard";
export const dynamic = "force-dynamic";
export default function PropertiesPage() {
  return (
    <GenericMasterTable
      tableName="properties"
      pageTitle="Properties"
      newButtonLabel="+ New asset"
      renderDashboard={(id, onBack) => (
        <PropertyDashboard propertyId={id} onBack={onBack} />
      )}
    />
  );
}
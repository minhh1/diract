"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import CustomTableMasterPage from "@/components/CustomTableMasterPage";

function CustomTablePageInner() {
  const params = useParams();
  const tableSlug = params.tableSlug as string;
  return <CustomTableMasterPage tableSlug={tableSlug} />;
}

export default function CustomTablePage() {
  return (
    <Suspense fallback={null}>
      <CustomTablePageInner />
    </Suspense>
  );
}
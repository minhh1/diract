"use client";

// app/dashboard/precedents/page.tsx
// The precedent library as a browsable destination in its own right, rather
// than only reachable from inside a matter (components/dashboard/tabs/
// PrecedentsTab.tsx) or from Settings.
//
// Those two surfaces answer "what can I issue on THIS matter". This one
// answers "what does the firm have" -- browsing before a matter exists,
// checking whether a precedent needs writing, or reading one to see how the
// firm approaches something. Hence search across the whole library, filters
// on the taxonomy, and a read-only preview of the actual drafting
// instructions and fill-in fields.
//
// Read-only by design. Editing stays in Settings > Precedents so there is
// one place that mutates the library.
import { Suspense } from "react";
import PrecedentLibraryBrowser from "@/components/precedents/PrecedentLibraryBrowser";

export default function PrecedentsPage() {
  return (
    <Suspense fallback={null}>
      <PrecedentLibraryBrowser />
    </Suspense>
  );
}

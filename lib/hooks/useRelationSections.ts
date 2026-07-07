// lib/hooks/useRelationSections.ts
"use client";

import { useMemo } from "react";
import { getSchemaMetadata, deriveLabel } from "@/lib/services/schemaService";
import { useState, useEffect } from "react";
import type { RelationDef } from "@/lib/relationDefinitions";

interface RelationSection {
  title: string;
  fields: { id: string; label: string }[];
}

// Builds column config drawer sections for expand-panel relation fields.
// Each relation becomes a section; fields come from get_schema_metadata
// on the child table — zero hardcoding.
export function useRelationSections(
  relations: RelationDef[],
  companyId?: string | null
): RelationSection[] {
  const [sections, setSections] = useState<RelationSection[]>([]);

  useEffect(() => {
    if (relations.length === 0) return;
    let active = true;

    (async () => {
      const results = await Promise.all(
        relations.map(async rel => {
          const cols = await getSchemaMetadata(rel.childTable, companyId);
          const fields = cols
            .filter(c =>
              c.category === 'data' &&
              !c.is_hidden &&
              // Exclude FK columns that point back to parent
              c.column_name !== rel.foreignKey
            )
            .map(c => ({
              // Prefix with relation key so the column ID is unique
              // e.g. 'child_properties:street_address'
              id: `${rel.key}:${c.column_name}`,
              label: c.label || deriveLabel(c.column_name),
            }));
          return { title: `${rel.label} (Expand)`, fields };
        })
      );
      if (active) setSections(results.filter(s => s.fields.length > 0));
    })();

    return () => { active = false; };
  }, [relations, companyId]);

  return sections;
}
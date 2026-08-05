// lib/hooks/useRelationSections.ts
"use client";

import { useState } from "react";
import { getSchemaMetadata, getCachedSchemaMetadata, deriveLabel, type ColumnMeta } from "@/lib/services/schemaService";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import type { RelationDef } from "@/lib/relationDefinitions";

interface RelationSection {
  title: string;
  fields: { id: string; label: string }[];
}

function buildSections(relations: RelationDef[], colsByRel: (ColumnMeta[] | null)[]): RelationSection[] {
  return relations
    .map((rel, i) => {
      const cols = colsByRel[i];
      if (!cols) return null;
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
    .filter((s): s is RelationSection => s !== null && s.fields.length > 0);
}

// Builds column config drawer sections for expand-panel relation fields.
// Each relation becomes a section; fields come from get_schema_metadata
// on the child table -- zero hardcoding.
export function useRelationSections(
  relations: RelationDef[],
  companyId?: string | null
): RelationSection[] {
  // Lazy initializer + layout effect below, same pattern as
  // useTableSchema.ts/useCompanyCustomFields.ts -- this hook previously had
  // neither, so relation sections (e.g. Properties' "Entities (Expand)"
  // drawer section) always started empty and only populated after a plain
  // useEffect resolved post-paint, even when every child table's schema was
  // already cached. That's the "system tables refetch/pop in something"
  // symptom the other two hooks' fix didn't cover, since this hook fetches
  // CHILD table schema, not the table's own.
  const [sections, setSections] = useState<RelationSection[]>(() => {
    if (relations.length === 0) return [];
    const cached = relations.map(rel => getCachedSchemaMetadata(rel.childTable, companyId));
    if (cached.some(c => c === null)) return [];
    return buildSections(relations, cached);
  });

  useIsomorphicLayoutEffect(() => {
    if (relations.length === 0) { setSections([]); return; }
    let active = true;

    const cached = relations.map(rel => getCachedSchemaMetadata(rel.childTable, companyId));
    if (!cached.some(c => c === null)) {
      setSections(buildSections(relations, cached));
    }

    (async () => {
      const results = await Promise.all(
        relations.map(rel => getSchemaMetadata(rel.childTable, companyId))
      );
      if (active) setSections(buildSections(relations, results));
    })();

    return () => { active = false; };
  }, [relations, companyId]);

  return sections;
}
// Read-only report: for a given company, compares every currently-installed
// precedent (by library_key, never manually edited since install -- i.e.
// created_at === updated_at) against what installPrecedentLibrary would
// build from today's library source, and lists any whose stored content has
// drifted from source. See scripts/resyncPrecedentContent.ts for the fix.
//
// Run: npx tsx scripts/diffInstalledPrecedents.ts <companyId>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { PRECEDENT_LIBRARY } from "../lib/precedents/library";
import type { BodyTemplateSegment } from "../lib/precedents/bodyTemplateDetect";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const companyId = process.argv[2];
  if (!companyId) { console.error("Usage: npx tsx scripts/diffInstalledPrecedents.ts <companyId>"); process.exit(1); }

  const { data: customFields } = await admin
    .from("company_custom_fields")
    .select("id, field_key")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .is("deleted_at", null);
  const fieldIdByKey = new Map<string, string>((customFields ?? []).map(f => [f.field_key, f.id]));

  const { data: rows } = await admin
    .from("precedents")
    .select("id, library_key, ai_instructions, body_template, created_at, updated_at")
    .eq("company_id", companyId)
    .not("library_key", "is", null)
    .is("deleted_at", null);

  let checked = 0, drifted = 0, editedSkipped = 0, notInSource = 0;

  for (const row of rows ?? []) {
    const seed = PRECEDENT_LIBRARY.find(s => s.key === row.library_key);
    if (!seed) { notInSource++; continue; }
    checked++;
    if (row.created_at !== row.updated_at) { editedSkipped++; continue; }

    const expectedSegments: BodyTemplateSegment[] | undefined = seed.segments?.map(s =>
      s.type === "field"
        ? { ...s, autoFillFieldId: s.autoFillFieldId ? fieldIdByKey.get(s.autoFillFieldId) ?? null : null }
        : s
    );
    const expectedBody = expectedSegments ? { segments: expectedSegments } : null;

    const bodyMatches = JSON.stringify(row.body_template) === JSON.stringify(expectedBody);
    const aiMatches = row.ai_instructions === seed.aiInstructions;

    if (!bodyMatches || !aiMatches) {
      drifted++;
      console.log(`DRIFTED: ${row.library_key}  (body: ${bodyMatches ? "ok" : "STALE"}, aiInstructions: ${aiMatches ? "ok" : "STALE"})`);
    }
  }

  console.log(`\nChecked ${checked} installed precedent(s) with a source match (${notInSource} no longer in source, ${editedSkipped} edited since install and skipped).`);
  console.log(`${drifted} drifted from current source.`);
}

main();

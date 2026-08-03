// One-off: refresh already-installed precedent rows' content from the
// current library source. installPrecedentLibrary() (lib/precedents/
// installLibrary.ts) deliberately never touches a row that's already
// installed -- correct in general (a firm may have customised their own
// copy), but it means content I improve in the library source after a key
// was already installed for a company never reaches that company's actual
// row. This re-syncs specific keys for a specific company, using the exact
// same construction installPrecedentLibrary uses (including resolving
// autoFillFieldId by field_key), and refuses to touch any row whose
// updated_at differs from its created_at -- i.e. anything a real admin has
// since edited is left alone.
//
// Run: npx tsx scripts/resyncPrecedentContent.ts <companyId> <key1> [key2] ...
//  or: npx tsx scripts/resyncPrecedentContent.ts <companyId> --all
//      (syncs every installed key that exists in current source -- the
//      per-row created_at/updated_at check below is what actually protects
//      anything a real admin has since customised, same as the explicit-key
//      form; see scripts/diffInstalledPrecedents.ts for a dry-run first)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { PRECEDENT_LIBRARY } from "../lib/precedents/library";
import { defaultUsesLetterhead } from "../lib/precedents/library/types";
import type { BodyTemplateSegment } from "../lib/precedents/bodyTemplateDetect";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const [companyId, ...rest] = process.argv.slice(2);
  if (!companyId || !rest.length) {
    console.error("Usage: npx tsx scripts/resyncPrecedentContent.ts <companyId> <key1> [key2] ...\n   or: npx tsx scripts/resyncPrecedentContent.ts <companyId> --all");
    process.exit(1);
  }

  let keys: string[];
  if (rest[0] === "--all") {
    const { data: installed } = await admin
      .from("precedents")
      .select("library_key")
      .eq("company_id", companyId)
      .not("library_key", "is", null)
      .is("deleted_at", null);
    const librarySourceKeys = new Set(PRECEDENT_LIBRARY.map(s => s.key));
    keys = [...new Set((installed ?? []).map(r => r.library_key as string))].filter(k => librarySourceKeys.has(k));
    console.log(`--all: found ${keys.length} installed key(s) present in current source.`);
  } else {
    keys = rest;
  }

  const { data: customFields } = await admin
    .from("company_custom_fields")
    .select("id, field_key")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .is("deleted_at", null);
  const fieldIdByKey = new Map<string, string>((customFields ?? []).map(f => [f.field_key, f.id]));

  let synced = 0, skipped = 0;
  for (const key of keys) {
    const seed = PRECEDENT_LIBRARY.find(s => s.key === key);
    if (!seed) { console.log(`SKIP ${key}: not in current library source`); skipped++; continue; }

    const { data: row } = await admin
      .from("precedents")
      .select("id, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("library_key", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) { console.log(`SKIP ${key}: not installed for this company`); skipped++; continue; }
    if (row.created_at !== row.updated_at) {
      console.log(`SKIP ${key}: row ${row.id} was edited after install (updated_at != created_at) -- leaving it alone`);
      skipped++;
      continue;
    }

    const segments: BodyTemplateSegment[] | undefined = seed.segments?.map(s =>
      s.type === "field"
        ? { ...s, autoFillFieldId: s.autoFillFieldId ? fieldIdByKey.get(s.autoFillFieldId) ?? null : null }
        : s
    );

    const { error } = await admin
      .from("precedents")
      .update({
        name: seed.name,
        description: seed.description,
        ai_instructions: seed.aiInstructions,
        body_template: segments ? { segments } : null,
        category: seed.category,
        subcategory: seed.subcategory ?? null,
        jurisdictions: seed.jurisdictions ?? null,
        matter_types: seed.matterTypes ?? null,
        document_type: seed.documentType,
        requires_review: seed.requiresReview ?? false,
        review_note: seed.reviewNote ?? null,
        uses_letterhead: seed.usesLetterhead ?? defaultUsesLetterhead(seed.documentType),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) { console.error(`FAILED ${key}: ${error.message}`); skipped++; continue; }
    console.log(`SYNCED ${key} (row ${row.id})`);
    synced++;
  }

  console.log(`\nSynced ${synced}, skipped ${skipped}, of ${keys.length} key(s).`);
}

main();

// One-off backfill for the auto-detect-common-fields feature
// (lib/documentTemplateAutoFillRelated.ts's detectAutoFill): that logic only
// ran for NEWLY uploaded templates going forward (see app/api/
// document-templates/upload/route.ts). Existing document_template_fields
// rows created before this feature shipped never got a chance to match, so
// this re-runs the exact same detection against every field that currently
// has no auto-fill configured at all, across every company.
//
// Only touches fields where auto_fill_field_id, auto_fill_relation_column
// and auto_fill_composite are ALL null -- a field an admin already bound
// (deliberately, or via this same detection at upload time) is never
// touched, so this is safe to re-run.
//
// Run: npx tsx scripts/backfillDocumentTemplateAutoFill.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { detectAutoFill } from "../lib/documentTemplateAutoFillRelated";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: fields, error: fieldsErr } = await admin
    .from("document_template_fields")
    .select("id, template_id, tag_key, label")
    .is("auto_fill_field_id", null)
    .is("auto_fill_relation_column", null)
    .is("auto_fill_composite", null);
  if (fieldsErr) throw fieldsErr;
  if (!fields?.length) { console.log("No untouched fields found."); return; }

  const templateIds = [...new Set(fields.map(f => f.template_id))];
  const { data: templates, error: templatesErr } = await admin
    .from("document_templates").select("id, company_id").in("id", templateIds);
  if (templatesErr) throw templatesErr;
  const companyIdByTemplate = new Map((templates ?? []).map(t => [t.id, t.company_id]));

  let scanned = 0, matched = 0, failed = 0;
  const byType: Record<string, number> = {};

  for (const f of fields) {
    scanned++;
    const companyId = companyIdByTemplate.get(f.template_id);
    if (!companyId) continue;

    const patch = await detectAutoFill(admin, companyId, f.label || f.tag_key);
    if (!patch) continue;

    const { error } = await admin.from("document_template_fields").update(patch).eq("id", f.id);
    if (error) {
      failed++;
      console.error(`  field ${f.id} ("${f.label}"): ${error.message}`);
      continue;
    }
    matched++;
    const type = patch.auto_fill_field_id ? "direct" : patch.auto_fill_composite ? `composite:${patch.auto_fill_composite}` : "related";
    byType[type] = (byType[type] ?? 0) + 1;
    console.log(`  matched: "${f.label}" -> ${type}`);
  }

  console.log(`\nScanned ${scanned} untouched field(s), auto-filled ${matched}, ${failed} failed.`);
  console.log("By type:", byType);
}

main();

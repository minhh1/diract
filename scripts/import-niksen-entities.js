// One-off import script for the Niksen Time entity-admin batch.
// Reads niksen-entities-batch{1..5}.csv, matches against existing entities,
// inserts/updates, and links directors via entity_officeholders.
// ACN/ABN are deliberately NOT imported -- per decision, left blank for a
// future ABR-backed auto-fill service.
"use strict";
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const NIKSEN_COMPANY_ID = "32d4fb0e-007d-41e7-bc5e-638163c28e3d";

// Rows to skip outright (not real client entities).
const SKIP_NAMES = new Set(["niksen time pty ltd"]);

// Explicit name overrides where case-insensitive exact match won't find the
// existing record (different wording/spelling, confirmed by manual review
// during transcription -- see niksen-entities-README.md).
const NAME_OVERRIDES = {
  "doan pham hoa holdings pty ltd": "Doan Pham Hoa Holdings Pty Ltd ATF Doan Pham Hoa Holdings Family Trust",
  "264 - 266 hamley heights pty ltd": "264-266 Hamley Heights Pty Ltd",
  "taree res alpha pty ltd": "Taree Res Alpha Pty Ltd ATF the Taree Res Alpha Unit Trust",
  "28 mcclelland pty ltd": "28 Mccleland Pty Ltd",
};

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") {}
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadBatch(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = parseCSV(text).filter(r => r.length > 1 && r[0]);
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
}

// "Feb 2019" / "22 Jun 2024" style strings all already have a real month
// name, no reformatting needed -- pass through as-is (native column is text).
function cleanEstablishedDate(v) { return v || null; }

function normalizeGstFrequency(v) {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (s.startsWith("q")) return "Quarterly";
  if (s.startsWith("m")) return "Monthly";
  if (s.startsWith("a")) return "Annually";
  return v;
}

// entity_type: pick the first badge when a row showed both (ambiguous,
// flagged during transcription) -- Company takes priority since it's listed
// first in every such row.
function normalizeEntityType(v) {
  if (!v) return "Company";
  return v.split(",")[0].trim();
}

// "Anh Tuan Doan (D,S); Toan (S)" -> [{name:"Anh Tuan Doan", roles:["Director","Secretary"]}, {name:"Toan", roles:["Secretary"]}]
function parseDirectors(v) {
  if (!v) return [];
  return v.split(/[;&]/).map(s => s.trim()).filter(Boolean).map(raw => {
    const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    let name = raw, roles = ["Director"];
    if (m) {
      name = m[1].trim();
      const tags = m[2].split(",").map(t => t.trim().toUpperCase());
      roles = [];
      if (tags.includes("D")) roles.push("Director");
      if (tags.includes("S")) roles.push("Secretary");
      if (roles.length === 0) roles = ["Director"];
    }
    return { name, roles };
  }).filter(d => d.name);
}

async function main() {
  const batchFiles = [1, 2, 3, 4, 5].map(n => path.join(__dirname, "..", `niksen-entities-batch${n}.csv`));
  const allRows = batchFiles.flatMap(loadBatch);
  console.log(`Loaded ${allRows.length} rows across ${batchFiles.length} batches`);

  const { data: existing } = await supabase.from("entities").select("id, name").eq("company_id", NIKSEN_COMPANY_ID).is("deleted_at", null);
  const existingByLowerName = new Map(existing.map(e => [e.name.trim().toLowerCase(), e]));

  const { data: customFields } = await supabase.from("company_custom_fields").select("id, field_key").eq("company_id", NIKSEN_COMPANY_ID).eq("table_name", "entities").is("deleted_at", null);
  const cfByKey = Object.fromEntries(customFields.map(f => [f.field_key, f.id]));

  const report = { inserted: [], updated: [], skipped: [], directorsCreated: [], officeholdersLinked: 0, ambiguous: [] };
  const directorCache = new Map(); // lowercase name -> entity id (this run's cache, seeded from existing below)
  for (const e of existing) directorCache.set(e.name.trim().toLowerCase(), e.id);

  for (const row of allRows) {
    const lowerName = row.name.trim().toLowerCase();
    if (SKIP_NAMES.has(lowerName)) { report.skipped.push(row.name); continue; }

    const overrideTarget = NAME_OVERRIDES[lowerName];
    let matchedEntity = overrideTarget
      ? existing.find(e => e.name.trim().toLowerCase() === overrideTarget.toLowerCase())
      : existingByLowerName.get(lowerName);

    const entityType = normalizeEntityType(row.entity_type);
    const establishedDate = cleanEstablishedDate(row.established_date);
    const tfn = row.tfn || null;
    const nativeFields = { entity_type: entityType, established_date: establishedDate, tfn };

    let entityId;
    if (matchedEntity) {
      const { error } = await supabase.from("entities").update(nativeFields).eq("id", matchedEntity.id);
      if (error) { console.error(`UPDATE FAILED for ${row.name}:`, error.message); continue; }
      entityId = matchedEntity.id;
      report.updated.push(row.name);
    } else {
      const { data: inserted, error } = await supabase.from("entities")
        .insert({ company_id: NIKSEN_COMPANY_ID, name: row.name, ...nativeFields })
        .select("id").single();
      if (error) { console.error(`INSERT FAILED for ${row.name}:`, error.message); continue; }
      entityId = inserted.id;
      existingByLowerName.set(lowerName, { id: entityId, name: row.name });
      directorCache.set(lowerName, entityId);
      report.inserted.push(row.name);
    }

    // Custom field values (GST Report Frequency / Bank Account Name / Xero Bank Feed)
    const cfValues = [
      { key: "gst_report_frequency", value: normalizeGstFrequency(row.gst_report_frequency) },
      { key: "bank_account_name", value: row.bank_account_name || null },
      { key: "xero_bank_feed", value: row.xero_bank_feed || null },
    ].filter(v => v.value && cfByKey[v.key]);

    for (const v of cfValues) {
      const fieldId = cfByKey[v.key];
      const { data: existingVal } = await supabase.from("company_custom_field_values")
        .select("id").eq("field_id", fieldId).eq("record_id", entityId).maybeSingle();
      if (existingVal) {
        await supabase.from("company_custom_field_values").update({ value_text: v.value }).eq("id", existingVal.id);
      } else {
        await supabase.from("company_custom_field_values").insert({
          company_id: NIKSEN_COMPANY_ID, field_id: fieldId, record_id: entityId, table_name: "entities", value_text: v.value,
        });
      }
    }

    // Directors -> entity_officeholders (+ resolve/create an Individual entity per director)
    const directors = parseDirectors(row.director_names);
    for (const d of directors) {
      const dLower = d.name.trim().toLowerCase();
      let directorEntityId = directorCache.get(dLower);
      if (!directorEntityId) {
        const { data: newDirector, error } = await supabase.from("entities")
          .insert({ company_id: NIKSEN_COMPANY_ID, name: d.name, entity_type: "Individual" })
          .select("id").single();
        if (error) { console.error(`Director insert failed for ${d.name}:`, error.message); continue; }
        directorEntityId = newDirector.id;
        directorCache.set(dLower, directorEntityId);
        report.directorsCreated.push(d.name);
      }
      for (const role of d.roles) {
        const { data: existingOfficeholder } = await supabase.from("entity_officeholders")
          .select("id").eq("entity_id", entityId).eq("officeholder_entity_id", directorEntityId).eq("role", role).maybeSingle();
        if (!existingOfficeholder) {
          await supabase.from("entity_officeholders").insert({
            entity_id: entityId, officeholder_entity_id: directorEntityId, full_name: d.name, role, is_active: true,
          });
          report.officeholdersLinked++;
        }
      }
    }

    if (row.flags && /confirm whether|genuinely different|manual resolution|manual confirmation/i.test(row.flags)) {
      report.ambiguous.push({ name: row.name, note: row.flags });
    }
  }

  console.log("\n=== IMPORT REPORT ===");
  console.log(`Inserted (${report.inserted.length}):`, report.inserted);
  console.log(`Updated (${report.updated.length}):`, report.updated);
  console.log(`Skipped (${report.skipped.length}):`, report.skipped);
  console.log(`Director entities created (${report.directorsCreated.length}):`, report.directorsCreated);
  console.log(`Officeholder links created: ${report.officeholdersLinked}`);
  console.log(`\nFlagged as ambiguous name-matching -- please review manually (${report.ambiguous.length}):`);
  report.ambiguous.forEach(a => console.log(`  - ${a.name}`));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

// app/api/ai/classify-field-sections/route.ts
// Groups a company's fields for one table (e.g. Projects, or a custom table)
// into a handful of named sections (e.g. "Client Details", "Trust
// Settings") so FieldLayoutEditor can render collapsible groups instead of
// one long flat list. Companies configure wildly different custom fields on
// the same system tables, so the grouping is decided per-company by an LLM
// looking at that company's actual field labels, rather than a hardcoded
// per-table-type guess.
//
// Scoped by (company_id, table_name), NOT per record -- every record of a
// table shares the same field set, so classifying per-record (the original
// design, keyed by record_tab_fields.tab_id) meant every single new record
// a user opened re-ran this call. Classifying once per company+table and
// reusing it for every record means this only ever runs again when a field
// gets added that isn't covered yet.
//
// Deliberately skips the token-cap check and ai_usage_events billing that
// every other app/api/ai/* route does -- this is a tiny, infrequent
// background classification of a couple dozen short field labels, treated
// as a platform operating cost rather than a company-billed AI feature.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { callHostedModel } from "@/lib/ai/modelCall";
import { HOSTED_MODELS } from "@/lib/billing/aiModels";

// HOSTED_MODELS[0], not the cheaper [1] -- see rewrite-text/route.ts's
// identical note: Together has previously retired the smaller 3.1-8B-Turbo
// from serverless (pay-per-token) availability, 400ing with
// "model_not_available" despite still being listed in the catalog.
const CLASSIFY_MODEL_ID = HOSTED_MODELS[0].id;

const FALLBACK_SECTION = "Details";

const SYSTEM_PROMPT = `You group a list of data-entry field labels from a business record (e.g. a legal matter, a property, a contact) into a small number of short, human-friendly section names -- the same way a form is split into labeled sections like "Client Details" or "Trust Settings".

Rules:
- Choose between 2 and 7 sections total. Fewer, broader sections are better than many narrow ones.
- Section names: Title Case, 1-3 words, no punctuation (e.g. "Client Details", "Key Dates", "Billing").
- Every field must be assigned to exactly one section.
- Group by what the field is ABOUT (who it concerns, what kind of data it is), not by its data type.
- Put the record's own core identity fields (name, description, status, type, number) in a section called "${FALLBACK_SECTION}".
- Output ONLY a JSON array, nothing else -- no markdown fences, no prose. Each element: {"field_key": "<exact key given>", "section": "<section name>"}.`;

interface InputField {
  field_key: string;
  label: string;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const tableName: string | undefined = body?.tableName;
  const fields: InputField[] = Array.isArray(body?.fields) ? body.fields : [];
  if (!tableName || fields.length === 0) {
    return NextResponse.json({ error: "tableName and a non-empty fields array are required" }, { status: 400 });
  }

  const userContent = JSON.stringify(fields.map(f => ({ field_key: f.field_key, label: f.label })));
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let content: string;
  try {
    const usage = await callHostedModel(CLASSIFY_MODEL_ID, messages);
    content = usage.content;
  } catch (err) {
    console.error("[classify-field-sections] model call failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  const sections: Record<string, string> = {};
  try {
    const match = content.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : content);
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        if (row?.field_key && typeof row.section === "string" && row.section.trim()) {
          sections[row.field_key] = row.section.trim();
        }
      }
    }
  } catch {
    // Fall through -- every field below gets the fallback section.
  }

  // Guarantee full coverage so the client never ends up with a
  // still-unclassified field re-triggering this route on every render.
  for (const f of fields) {
    if (!sections[f.field_key]) sections[f.field_key] = FALLBACK_SECTION;
  }

  const upserts = fields.map(f => ({
    company_id: companyId,
    table_name: tableName,
    field_key: f.field_key,
    section: sections[f.field_key],
  }));
  const { error } = await admin
    .from("company_table_field_sections")
    .upsert(upserts, { onConflict: "company_id,table_name,field_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sections });
}

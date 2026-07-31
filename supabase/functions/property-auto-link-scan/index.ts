// supabase/functions/property-auto-link-scan/index.ts
// Scans every company's projects for ones whose NAME looks like a property
// address (e.g. "Purchase - Units 1 & 2, 305 Auburn Road, Hawthorn VIC
// 3122") but have no Property linked yet, and proposes a link into
// property_auto_link_requests -- an admin-approval queue (see
// supabase/migrations/20260730160000_property_auto_link_requests.sql),
// same "detect + propose, never auto-apply" shape as the Leads email
// assignment queue. Runs on a pg_cron schedule (see
// supabase/property_auto_link_cron.sql) so this ALSO IS the one-time
// backfill across existing projects -- the first tick (or a manual
// invocation) already covers every currently-unlinked project, "skip if
// already there" falling out naturally from the exclusion query below.
//
// Deliberately self-contained (no shared import from the Next app's lib/ --
// this runs in Deno, a separate module-resolution world) even though the
// address-parsing here has no live counterpart elsewhere yet; matches every
// other edge function in this folder.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

// ── Address parsing ─────────────────────────────────────────────────

const AU_STATES = "NSW|VIC|QLD|WA|SA|TAS|ACT|NT";

// A project name is often "<transaction type> - <address>" (e.g. "Purchase
// - 305 Auburn Road..."); only the part after the LAST " - " is a real
// address candidate. A name with no " - " at all is tried whole (e.g. a
// project literally just named "305 Auburn Road").
function addressCandidate(projectName: string): string {
  const parts = projectName.split(/\s+-\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : projectName).trim();
}

// Common Australian street-type words -- gates which candidates are even
// worth trying to parse, so a non-address project name ("Smith Family
// Trust Establishment", "Matter 12345") never reaches the admin queue as a
// guess. Deliberately permissive (admin approval is the real safety net,
// this just keeps the queue from filling with obvious noise).
const STREET_TYPE_RE = /\b(road|rd|street|st|avenue|ave|drive|dr|court|ct|place|pl|lane|ln|way|boulevard|blvd|crescent|cres|parade|pde|highway|hwy|terrace|tce|close|grove|circuit|cct)\b/i;

interface ParsedAddress { street: string; suburb: string | null; state: string | null; postcode: string | null; }

// Peels ", <Suburb> <STATE> <postcode>" off the end if present. A candidate
// with no such suffix (just "305 Auburn Road") still parses -- suburb/
// state/postcode land null and only street_address is used to match/create.
function parseAddress(candidate: string): ParsedAddress | null {
  if (!/\d/.test(candidate) || !STREET_TYPE_RE.test(candidate)) return null;
  const withSuburb = new RegExp(`^(.*?),\\s*([A-Za-z][A-Za-z\\s]*?)\\s+(${AU_STATES})\\s+(\\d{4})\\s*$`, "i").exec(candidate);
  if (withSuburb) {
    return { street: withSuburb[1].trim(), suburb: withSuburb[2].trim(), state: withSuburb[3].toUpperCase(), postcode: withSuburb[4] };
  }
  return { street: candidate.trim(), suburb: null, state: null, postcode: null };
}

// Detects "Units 1 & 2" / "Units 1, 2 and 3" in the street portion and
// expands it into one street-address variant per unit, e.g.
// "Units 1 & 2, 305 Auburn Road" -> ["Unit 1, 305 Auburn Road", "Unit 2,
// 305 Auburn Road"]. Returns null (single property, street unchanged) if no
// such phrase is found -- deliberately NOT triggered by:
//  - a plain street-number range like "10-14 Auburn Road" (conventionally
//    one lot/title, not several units)
//  - singular "Unit 5, 12 Jones Road" (an extremely common single-property
//    AU address format -- the comma there separates unit from street
//    number, not two units, so requiring the PLURAL "Units" and an
//    explicit "&"/"and" between numbers is what distinguishes a real list
//    from that -- a comma-only run would otherwise greedily swallow the
//    street number itself as if it were a third "unit").
function splitMultiUnit(street: string): string[] | null {
  const m = /\bUnits\s+(\d+(?:\s*,\s*\d+)*\s*(?:&|and)\s*\d+)\b/i.exec(street);
  if (!m) return null;
  const numbers = m[1].split(/[,&]|and/i).map(s => s.trim()).filter(s => /^\d+$/.test(s));
  if (numbers.length < 2) return null;
  const rest = (street.slice(0, m.index) + street.slice(m.index + m[0].length)).replace(/^[,\s]+|[,\s]+$/g, "");
  if (!rest) return null;
  return numbers.map(n => `Unit ${n}, ${rest}`);
}

interface ProposedProperty { streetAddress: string; suburb: string | null; state: string | null; postcode: string | null; propertyId: string | null }

// Resolves one street address to an existing properties row, same
// exact-then-fuzzy-single-candidate approach used by gmail-addon's
// resolveOrCreateRelation -- exact case-insensitive match first, else a
// substring match ONLY if it narrows to exactly one row. propertyId stays
// null (propose creating a new Property) on no/ambiguous match.
async function matchProperty(companyId: string, addr: ProposedProperty): Promise<string | null> {
  let q = db.from("properties").select("id").eq("company_id", companyId).is("deleted_at", null).ilike("street_address", addr.streetAddress);
  if (addr.suburb) q = q.eq("suburb", addr.suburb);
  const { data: exact } = await q.limit(1).maybeSingle();
  if (exact) return exact.id;

  const { data: fuzzy } = await db.from("properties").select("id")
    .eq("company_id", companyId).is("deleted_at", null).ilike("street_address", `%${addr.streetAddress}%`);
  if (fuzzy && fuzzy.length === 1) return fuzzy[0].id;
  return null;
}

async function proposeForProject(companyId: string, projectId: string, projectName: string): Promise<boolean> {
  const parsed = parseAddress(addressCandidate(projectName));
  if (!parsed) return false;

  const variants = splitMultiUnit(parsed.street) ?? [parsed.street];
  const proposed: ProposedProperty[] = [];
  for (const streetAddress of variants) {
    const addr: ProposedProperty = { streetAddress, suburb: parsed.suburb, state: parsed.state, postcode: parsed.postcode, propertyId: null };
    addr.propertyId = await matchProperty(companyId, addr);
    proposed.push(addr);
  }

  const { error } = await db.from("property_auto_link_requests").insert({
    company_id: companyId, project_id: projectId, project_name: projectName, proposed,
  });
  if (!error) {
    // Best-effort -- same pattern as gmail-addon's resolveOrCreateRelation
    // notifying admins about a needs-review row it just created.
    await db.rpc("notify_company_admins", {
      p_company_id: companyId,
      p_event_type: "property_link_request_submitted",
      p_title: `Property link request: ${projectName}`,
      p_link_url: "/dashboard/admin?tab=propertyAutoLink",
      p_entity_table: "property_auto_link_requests",
    }).catch(() => {});
  }
  return !error;
}

// ── Overlap guard (same dispatcher_locks pattern every other -worker/-cron
// function in this app uses) -- this scan is cheap (no external API calls),
// so no dispatcher/processor split is needed, just a simple single-tick lock. ──
const LOCK_NAME = "property-auto-link-scan";
const LOCK_TTL_MS = 170_000;

async function acquireLock(): Promise<boolean> {
  const { data } = await db.from("dispatcher_locks")
    .update({ locked_until: new Date(Date.now() + LOCK_TTL_MS).toISOString() })
    .eq("name", LOCK_NAME).lt("locked_until", new Date().toISOString()).select();
  return !!data && data.length > 0;
}
async function releaseLock(): Promise<void> {
  try { await db.from("dispatcher_locks").update({ locked_until: new Date().toISOString() }).eq("name", LOCK_NAME); } catch (_) {}
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break the scan over a heartbeat write */ }
}

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (_req) => {
  const t0 = Date.now();
  if (!(await acquireLock())) {
    return respond({ ok: true, skipped: "already_running" });
  }

  try {
    const { data: companies } = await db.from("companies").select("id, disabled_system_tables");
    let scanned = 0, proposed = 0;

    for (const company of companies || []) {
      const disabled = (company.disabled_system_tables as Record<string, unknown> | null) || {};
      if (disabled.properties) continue; // firm doesn't use the Properties table at all

      const [{ data: projectRows }, { data: linkedRows }, { data: requestedRows }] = await Promise.all([
        db.from("projects").select("id, name").eq("company_id", company.id).is("deleted_at", null),
        db.from("project_properties").select("project_id").eq("company_id", company.id),
        db.from("property_auto_link_requests").select("project_id").eq("company_id", company.id),
      ]);
      const linkedIds = new Set((linkedRows || []).map((r) => r.project_id));
      const requestedIds = new Set((requestedRows || []).map((r) => r.project_id));

      for (const project of projectRows || []) {
        if (linkedIds.has(project.id) || requestedIds.has(project.id)) continue;
        scanned++;
        if (await proposeForProject(company.id, project.id, project.name)) proposed++;
      }
    }

    await heartbeat("property-auto-link-scan", Date.now() - t0, { scanned, proposed });
    return respond({ ok: true, scanned, proposed });
  } finally {
    await releaseLock();
  }
});

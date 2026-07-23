// supabase/functions/onedrive-sync-worker/index.ts
// Polls Microsoft Graph for every company with connected OneDrive/SharePoint
// credentials (see supabase/company_onedrive_credentials.sql), on the
// schedule set up in supabase/onedrive_sync_cron.sql. Self-contained, same
// shape as teams-sync-worker/index.ts -- Edge Functions run on Deno and
// can't import the Next app's lib/ files.
//
// App-only auth (client-credentials grant) -- requires the company's Azure
// AD app to have been granted org admin consent for the Files.ReadWrite.All
// application permission (admin_consent_granted flag, set manually by the
// company admin after completing that Azure step -- this worker has no way
// to detect consent itself, it just tries the call and records the error).
//
// Text extraction: .txt/.md are used as-is. .pdf/.docx go through a
// best-effort extraction step (mammoth for .docx, pdfjs-dist for .pdf, both
// loaded via Deno's npm: specifier support) wrapped in try/catch -- if
// extraction fails for a given file (unsupported variant, corrupt content,
// a library incompatibility in this runtime), the file's metadata is still
// stored with a null extracted_text rather than failing the whole sync run.
// .xlsx/.pptx are not extracted in this version.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_ITEMS_PER_RUN = 500;

interface OnedriveCredentials {
  tenant_id: string;
  client_id: string;
  client_secret: string;
}

async function getAppToken(creds: OnedriveCredentials): Promise<string | null> {
  const res = await fetch(`https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  return json.access_token ?? null;
}

async function getCursor(companyId: string): Promise<string | null> {
  const { data } = await db.from("onedrive_sync_cursors").select("delta_link").eq("company_id", companyId).maybeSingle();
  return data?.delta_link ?? null;
}

async function saveCursor(companyId: string, deltaLink: string) {
  await db.from("onedrive_sync_cursors").upsert({ company_id: companyId, delta_link: deltaLink, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
}

async function fetchDelta(token: string, startUrl: string): Promise<{ items: any[]; deltaLink: string | null }> {
  const items: any[] = [];
  let url: string | null = startUrl;
  let deltaLink: string | null = null;

  while (url && items.length < MAX_ITEMS_PER_RUN) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph delta fetch failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    items.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    if (json["@odata.deltaLink"]) deltaLink = json["@odata.deltaLink"];
  }
  return { items, deltaLink };
}

async function extractText(name: string, buffer: ArrayBuffer): Promise<string | null> {
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      return new TextDecoder("utf-8").decode(buffer);
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("npm:mammoth@1.8.0");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return result.value || null;
    }
    if (lower.endsWith(".pdf")) {
      const pdfjs = await import("npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it: any) => it.str).join(" ") + "\n";
      }
      return text.trim() || null;
    }
  } catch (err) {
    console.error(`OneDrive text extraction failed for "${name}":`, err instanceof Error ? err.message : err);
  }
  return null;
}

interface SyncSummary {
  items: number;
  filesStored: number;
  extractionFailures: number;
}

async function syncCompany(companyId: string, creds: OnedriveCredentials, driveId: string): Promise<SyncSummary> {
  const token = await getAppToken(creds);
  if (!token) throw new Error("Failed to acquire app-only Graph token");

  const cursor = await getCursor(companyId);
  const startUrl = cursor ?? `${GRAPH_BASE}/drives/${driveId}/root/delta`;
  const { items, deltaLink } = await fetchDelta(token, startUrl);

  const rows: Record<string, unknown>[] = [];
  let extractionFailures = 0;

  for (const item of items) {
    if (item.folder || item.deleted) continue; // only sync actual files
    if (!item.file) continue;

    let extractedText: string | null = null;
    const supportedExt = /\.(txt|md|docx|pdf)$/i.test(item.name ?? "");
    if (supportedExt) {
      try {
        const contentRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${item.id}/content`, { headers: { Authorization: `Bearer ${token}` } });
        if (contentRes.ok) {
          const buffer = await contentRes.arrayBuffer();
          extractedText = await extractText(item.name, buffer);
          if (!extractedText) extractionFailures++;
        }
      } catch {
        extractionFailures++;
      }
    }

    rows.push({
      company_id: companyId,
      item_id: item.id,
      name: item.name,
      path: item.parentReference?.path ?? null,
      web_url: item.webUrl ?? null,
      mime_type: item.file?.mimeType ?? null,
      extracted_text: extractedText,
      updated_at: item.lastModifiedDateTime ?? new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    await db.from("onedrive_files").upsert(rows, { onConflict: "company_id,item_id" });
  }
  if (deltaLink) await saveCursor(companyId, deltaLink);

  return { items: items.length, filesStored: rows.length, extractionFailures };
}

Deno.serve(async () => {
  const started = Date.now();
  const { data: companies } = await db
    .from("company_onedrive_credentials")
    .select("company_id, credentials, drive_id")
    .eq("admin_consent_granted", true)
    .not("drive_id", "is", null);

  const results: Record<string, string> = {};

  for (const row of companies ?? []) {
    try {
      const summary = await syncCompany(row.company_id, row.credentials as OnedriveCredentials, row.drive_id);
      await db.from("company_onedrive_credentials").update({ last_synced_at: new Date().toISOString(), last_sync_error: null }).eq("company_id", row.company_id);
      results[row.company_id] = `ok: ${JSON.stringify(summary)}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.from("company_onedrive_credentials").update({ last_sync_error: message }).eq("company_id", row.company_id);
      results[row.company_id] = `error: ${message}`;
    }
  }

  await db.from("cron_heartbeats").upsert(
    { name: "onedrive-sync-worker", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: results },
    { onConflict: "name" }
  );

  return new Response(JSON.stringify({ synced: Object.keys(results).length, results }), { headers: { "Content-Type": "application/json" } });
});

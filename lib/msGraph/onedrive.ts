// lib/msGraph/onedrive.ts
// App-only (client-credentials) Microsoft Graph access to a company's
// configured SharePoint document library -- used by the admin setup route
// (site/drive resolution) and by the bot's create_file/update_file actions
// (lib/ai/actions.ts). The actual RAG-ingestion delta sync lives in its own
// self-contained Edge Function (supabase/functions/onedrive-sync-worker)
// since Edge Functions can't import Next.js lib/ code -- this file is for
// the Next.js side only.
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function getGraphAppToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Failed to get Graph app token: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

export interface ResolvedSite {
  siteId: string;
  driveId: string;
}

// site_url looks like "https://contoso.sharepoint.com/sites/TeamName" --
// Graph's site-by-path lookup wants "{hostname}:/{server-relative-path}".
export async function resolveSiteAndDrive(token: string, siteUrl: string): Promise<ResolvedSite> {
  const url = new URL(siteUrl);
  const path = url.pathname.replace(/\/$/, "");
  const siteRes = await fetch(`${GRAPH_BASE}/sites/${url.hostname}:${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!siteRes.ok) throw new Error(`Failed to resolve SharePoint site: ${siteRes.status} ${await siteRes.text()}`);
  const site = await siteRes.json();

  const driveRes = await fetch(`${GRAPH_BASE}/sites/${site.id}/drive`, { headers: { Authorization: `Bearer ${token}` } });
  if (!driveRes.ok) throw new Error(`Failed to resolve document library: ${driveRes.status} ${await driveRes.text()}`);
  const drive = await driveRes.json();

  return { siteId: site.id, driveId: drive.id };
}

// Walks a folder path (e.g. "Projects/Acme Corp"), creating any segment
// that doesn't exist yet. Returns nothing -- callers address files by path
// directly (PUT .../root:/{path}/{name}:/content), this just guarantees
// the path is there first.
export async function ensureFolderPath(token: string, driveId: string, folderPath: string): Promise<void> {
  const segments = folderPath.split("/").filter(Boolean);
  let builtPath = "";
  for (const segment of segments) {
    const parentPath = builtPath;
    builtPath = builtPath ? `${builtPath}/${segment}` : segment;

    const checkRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(builtPath)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (checkRes.ok) continue;

    const parentSegment = parentPath ? `root:/${encodeURIComponent(parentPath)}:` : "root";
    const createRes = await fetch(`${GRAPH_BASE}/drives/${driveId}/${parentSegment}/children`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: segment, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
    });
    if (!createRes.ok) throw new Error(`Failed to create OneDrive folder "${segment}": ${createRes.status} ${await createRes.text()}`);
  }
}

export interface UploadedFile {
  id: string;
  webUrl: string;
}

// Simple upload (content < 4MB, fine for AI-drafted text) -- creates the
// file if it doesn't exist, overwrites it if it does (folderPath is
// ensured first by the caller via ensureFolderPath).
export async function uploadFile(token: string, driveId: string, folderPath: string, fileName: string, content: string): Promise<UploadedFile> {
  const path = folderPath ? `${folderPath}/${fileName}` : fileName;
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(path)}:/content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: content,
  });
  if (!res.ok) throw new Error(`Failed to upload OneDrive file: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { id: json.id, webUrl: json.webUrl };
}

export async function updateFileContent(token: string, driveId: string, itemId: string, content: string): Promise<UploadedFile> {
  const res = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: content,
  });
  if (!res.ok) throw new Error(`Failed to update OneDrive file: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { id: json.id, webUrl: json.webUrl };
}

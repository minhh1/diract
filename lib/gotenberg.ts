// lib/gotenberg.ts
// Converts legacy Word 97-2003 .doc files to real .docx via our own small
// conversion microservice (docservice/) — NOT Gotenberg's own HTTP API,
// which only ever outputs PDF. docservice/ is built on the gotenberg base
// image purely to reuse the LibreOffice install it already ships.
//
// Local dev:
//   docker build -t doc-converter docservice/
//   docker run -d --name doc-converter -p 3033:3000 doc-converter
// (GOTENBERG_URL defaults to http://localhost:3033.)
//
// Production (e.g. Vercel, which can't run LibreOffice in a serverless
// function): deploy the same image to a host you control (Fly.io, Railway,
// a small VPS) and set GOTENBERG_URL to its reachable address.
const GOTENBERG_URL = process.env.GOTENBERG_URL || "http://localhost:3033";

async function convert(bytes: Buffer, filename: string, targetFormat: "docx" | "pdf"): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(`${GOTENBERG_URL}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Filename": filename, "X-Target-Format": targetFormat },
      body: new Uint8Array(bytes),
    });
  } catch {
    throw new Error(
      `Could not reach the document conversion service at ${GOTENBERG_URL}. ` +
      `Is it running? (docker run -d --name doc-converter -p 3033:3000 doc-converter — see docservice/Dockerfile)`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Document conversion failed (${res.status}): ${text.slice(0, 200) || "unknown error"}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function convertDocToDocx(bytes: Buffer, filename: string): Promise<Buffer> {
  return convert(bytes, filename, "docx");
}

// Renders an issued precedent's filled-in .docx (letterhead + composed
// letter text, see app/api/precedents/[id]/issue/route.ts) to PDF for
// delivery, and the raw letterhead upload to PDF for the admin "Preview"
// action (see app/api/precedents/letterhead/route.ts) so a tag-placement
// mistake is visible before it's relied on.
export async function convertDocxToPdf(bytes: Buffer, filename = "document.docx"): Promise<Buffer> {
  return convert(bytes, filename, "pdf");
}

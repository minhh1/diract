// Thin fetch wrapper over the Resend REST API -- same raw-fetch approach as
// lib/sms/sendMessage.ts (Twilio) and lib/whatsappBot/sendMessage.ts, rather
// than the `resend` npm package. Platform-owned account
// (RESEND_API_KEY, see .env.example), shared across every company; each
// company can additionally verify its own sending domain under that same
// account (see company_email_domains / app/api/company/email-domain).
const RESEND_API = "https://api.resend.com";

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend is not configured (RESEND_API_KEY)");
  return key;
}

async function resendFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${path} failed: ${res.status} ${json?.message ?? JSON.stringify(json)}`);
  return json;
}

export interface ResendDnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  records: ResendDnsRecord[];
}

export async function createDomain(name: string): Promise<ResendDomain> {
  return resendFetch("/domains", { method: "POST", body: JSON.stringify({ name }) });
}

export async function getDomain(id: string): Promise<ResendDomain> {
  return resendFetch(`/domains/${id}`);
}

export async function verifyDomain(id: string): Promise<{ id: string }> {
  return resendFetch(`/domains/${id}/verify`, { method: "POST" });
}

export async function deleteDomain(id: string): Promise<void> {
  await resendFetch(`/domains/${id}`, { method: "DELETE" });
}

export async function sendEmail(params: { from: string; to: string; subject: string; html: string }): Promise<{ id: string }> {
  return resendFetch("/emails", { method: "POST", body: JSON.stringify(params) });
}

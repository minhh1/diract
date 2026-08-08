// lib/email/unsubscribeToken.ts
// A one-click unsubscribe link needs to identify (company, email) without
// requiring the recipient to log in -- and without a database row per
// recipient per send just to hold a token. An HMAC of company_id+email
// does the same job stateless: the link carries the signature, the
// unsubscribe route recomputes it and only writes to email_unsubscribes if
// it matches. Signed with SUPABASE_SERVICE_ROLE_KEY (server-only, already
// a long random secret) rather than introducing a dedicated env var for
// one internal signing use.
import { createHmac } from "crypto";

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return key;
}

export function signUnsubscribe(companyId: string, email: string): string {
  return createHmac("sha256", secret()).update(`${companyId}:${email.toLowerCase()}`).digest("hex");
}

export function verifyUnsubscribe(companyId: string, email: string, signature: string): boolean {
  return signUnsubscribe(companyId, email) === signature;
}

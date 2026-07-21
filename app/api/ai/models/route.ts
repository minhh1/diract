// app/api/ai/models/route.ts
// Model picker source: the hand-curated hosted catalog, plus whatever the
// company's self-hosted Ollama reports live (if configured), so the
// dropdown in app/dashboard/ai/page.tsx can offer both.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { HOSTED_MODELS } from "@/lib/billing/aiModels";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("self_hosted_ollama_url")
    .eq("company_id", companyId)
    .maybeSingle();

  const hosted = HOSTED_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    provider: "hosted" as const,
    contextWindow: m.contextWindow,
  }));

  let selfHosted: { id: string; label: string; provider: "self_hosted" }[] = [];
  const ollamaUrl = settings?.self_hosted_ollama_url;
  if (ollamaUrl) {
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        selfHosted = (json.models ?? []).map((m: { name: string }) => ({
          id: m.name,
          label: `${m.name} (self-hosted)`,
          provider: "self_hosted" as const,
        }));
      }
    } catch {
      // Self-hosted Ollama unreachable -- fall back to hosted-only silently,
      // the chat route surfaces a clearer error if the user picks a
      // self-hosted model that's no longer there.
    }
  }

  return NextResponse.json({ models: [...hosted, ...selfHosted] });
}

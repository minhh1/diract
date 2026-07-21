// app/api/ai/settings/route.ts
// Admin-only read/write for ai_chat_settings -- which data sources feed the
// assistant, the company's self-hosted Ollama URL (if any), and the
// monthly token cap enforced in app/api/ai/chat/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("ai_chat_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: data ?? {
      company_id: companyId,
      source_crm: true,
      source_gmail: true,
      source_whatsapp: true,
      source_teams: true,
      self_hosted_ollama_url: null,
      monthly_token_cap: 2000000,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { source_crm, source_gmail, source_whatsapp, source_teams, self_hosted_ollama_url, monthly_token_cap } = body ?? {};

  const { data, error } = await admin
    .from("ai_chat_settings")
    .upsert(
      {
        company_id: companyId,
        source_crm: !!source_crm,
        source_gmail: !!source_gmail,
        source_whatsapp: !!source_whatsapp,
        source_teams: !!source_teams,
        self_hosted_ollama_url: self_hosted_ollama_url || null,
        monthly_token_cap: Number.isFinite(monthly_token_cap) ? monthly_token_cap : 2000000,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

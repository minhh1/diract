// app/api/ai/chat/route.ts
// Chat endpoint backing app/dashboard/ai/page.tsx -- the table/dashboard-
// builder assistant. Admin-only (see the isAdmin check below): every tool
// call in lib/ai/tableBuilderTools.ts runs with admin-equivalent rights
// regardless of who's chatting, so access to the chat itself is gated the
// same way any other admin-level action in this app is.
//
// This used to be a general RAG Q&A assistant grounded in CRM/Gmail/
// WhatsApp/Teams/OneDrive data (see lib/ai/retrieval.ts, still used by the
// Microsoft Teams bot at app/api/teams/bot/[companyId]/route.ts -- untouched
// by this route now). Retrieval is gone here; the assistant's job is schema
// construction, and list_existing_tables/list_existing_dashboards (plain
// SQL lookups) replace semantic search as the "what does this company
// already have" mechanism.
//
// Response body is newline-delimited JSON: `{"delta": "..."}` lines as
// tokens arrive, `{"tool": name, "input": {...}, "phase": "start"|"done", "isError"?}`
// lines around each tool call (see lib/ai/modelCall.ts's onToolCall) so the
// UI can show live "Creating table 'Invoices'..." progress instead of going
// silent for however long a multi-step build takes, ending with
// `{"done": true}`.
import { NextRequest } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { callTogetherModelWithTools, type TokenUsage } from "@/lib/ai/modelCall";
import { TABLE_BUILDER_TOOLS, executeTableBuilderTool } from "@/lib/ai/tableBuilderTools";
import { costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

// Together-hosted, not Claude -- has a confirmed "Function Calling" badge
// on Together's own model page (unlike DeepSeek V4 Flash, which doesn't),
// which matters here since this whole route only exists to call tools.
// 512K context (not the full 1M DeepSeek V4 Flash claims), ~$1.74/$3.48
// per 1M tokens -- far cheaper than Claude, no separate Anthropic billing
// relationship needed since TOGETHER_API_KEY is already configured for
// this app's other AI features.
const MODEL_ID = "deepseek-ai/DeepSeek-V4-Pro";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You help set up custom tables, fields, and dashboards for this company's business in Diract, a business management tool. A user might describe their business (e.g. "I run a plumbing company with 10 employees, I want to create invoices and manage payroll") and you should design and actually create sensible tables, fields, and a dashboard for it using your tools -- not just describe what they should build.

Guidelines:
- Always call list_existing_tables and list_existing_dashboards before creating anything, so you don't duplicate what's already there.
- Design sensible field sets for the tables you create (e.g. an Invoices table wants fields like client, amount, due date, status; a Payroll/Employees table wants fields like name, hourly rate, hours worked, pay period).
- Use computed fields (create_field's formula_type) for anything that should auto-calculate instead of being typed in -- e.g. a line item's Amount as quantity × rate (formula_type 'multiply'), GST as 10% of a subtotal (formula_type 'percentage_of'), or an invoice's Total as the sum of its related line items' amounts (formula_type 'sum_related'). Sequence these calls in order: create a formula field's dependency fields first (in earlier create_field calls), then create the formula field referencing them by label. For 'sum_related'/'max_related' specifically, the CHILD table needs its own table_relation field pointing back at the parent -- create that relation field first if it doesn't already exist, then create the rollup field on the parent referencing it.
- Before calling create_table, create_field, create_dashboard, or add_widget: first lay out your full plan in one message -- every table you'll create, every field on it with its type (and why that type/setup fits, e.g. "status as select with Draft/Sent/Paid so it can be filtered"), and the dashboard/widgets you'll add and why -- then explicitly ask the user to confirm before you build it. Wait for their next message to agree. Only after they've confirmed should you call these tools, passing confirm=true on each. If you call one without the user having agreed to that specific plan first, it will be rejected.
- After the user confirms and you create a table and its fields, create a dashboard for it and add at least one widget (e.g. a grid to view/enter records, a summary_tile for a running total) so it's actually usable, not just an empty schema.
- If the user wants to print/export/email records as a PDF (e.g. an invoice, a letter), add a document_export widget (add_widget's document_export_style + field-mapping params) instead of saying you can't -- 'invoice' style renders a billing-document layout (invoice number/date, bill-to, one line item per record from its own description/amount fields, subtotal/tax/total); 'letter' style renders a text field's contents onto the company's letterhead (mention it needs a letterhead uploaded first in Settings → Precedents if the export later fails for that reason). Map whichever of the widget's fields make sense to the table's own fields; leave the rest unset.
- Only propose building/changing something when the user's message actually calls for it. For casual questions or small talk, just answer in plain text.
- Before calling delete_table, delete_field, remove_widget, or delete_dashboard: first state in your own words exactly what will be deleted and any consequences (e.g. "This will remove the Payroll table and its 3 fields"), and wait for the user's explicit confirmation in their next message. Only then call the tool with confirm=true. If you call a delete tool without the user having agreed first, it will be rejected.
- When you do delete something, mention in your reply that it's restorable afterward via Settings → Trash or Settings → Schema History.
- Keep replies brief and focused on what you did or need to know next.`;

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const question: string | undefined = body?.question;
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];
  const conversationId: string | undefined = body?.conversationId;

  if (!question) {
    return new Response(JSON.stringify({ error: "question is required" }), { status: 400 });
  }

  // Persisted so a conversation survives a refresh/reopen (see
  // supabase/ai_conversations.sql, supabase/ai_messages.sql) -- the id is
  // client-generated, so the first message in a new chat creates the
  // conversation row here rather than needing a separate create call.
  //
  // Never blindly upserts company_id/user_id onto an existing row -- a
  // user who belongs to more than one company and switches between them
  // (see components/Sidebar.tsx's handleSwitchCompany) gets a fresh page
  // load, but a stale conversationId reused across that switch (e.g. a
  // replayed/retried request) must not silently reassign an existing
  // conversation from one company to another. Reject instead.
  if (conversationId) {
    const { data: existing } = await admin
      .from("ai_conversations")
      .select("company_id, user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (existing && (existing.company_id !== companyId || existing.user_id !== user.id)) {
      return new Response(JSON.stringify({ error: "This conversation belongs to a different company or user" }), { status: 403 });
    }
    if (existing) {
      await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    } else {
      await admin.from("ai_conversations").insert({ id: conversationId, company_id: companyId, user_id: user.id });
    }
    await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: question });
  }

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("monthly_token_cap, ai_enabled")
    .eq("company_id", companyId)
    .maybeSingle();

  if (settings?.ai_enabled === false) {
    return new Response(JSON.stringify({ error: "AI features are disabled for this company" }), { status: 403 });
  }

  const tokenCap = settings?.monthly_token_cap ?? 1000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return new Response(JSON.stringify({ error: "Monthly token cap reached for this company" }), { status: 429 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, content: "" };
      try {
        const onDelta = (delta: string) => controller.enqueue(ndjson({ delta }));
        const onToolCall = (name: string, input: Record<string, unknown>, phase: "start" | "done", isError?: boolean) =>
          controller.enqueue(ndjson({ tool: name, input, phase, isError }));
        const result = await callTogetherModelWithTools(
          MODEL_ID,
          SYSTEM_PROMPT,
          [...history, { role: "user", content: question }],
          TABLE_BUILDER_TOOLS,
          (name, input) => executeTableBuilderTool(admin, companyId, user.id, name, input),
          onDelta,
          onToolCall
        );
        usage = result;

        // A cut-short multi-step build looks, from the client's point of
        // view, like the assistant just stopped talking mid-task -- this
        // tells the user why, rather than leaving it looking finished when
        // it isn't. (Together/OpenAI-style APIs have no distinct "refusal"
        // signal the way Anthropic's does -- a decline just comes back as
        // normal assistant text with finish_reason "stop".)
        if (result.hitIterationLimit) {
          controller.enqueue(ndjson({ error: "This is taking more steps than I can do in one go -- ask me to continue and I'll pick up from here." }));
        }
      } catch (err) {
        // callTogetherModelWithTools already translates request failures
        // into a message meant for an end user -- don't fall back to
        // String(err) here, which would print raw internals for any
        // non-Error throw.
        controller.enqueue(ndjson({ error: err instanceof Error ? err.message : "Something went wrong talking to the assistant. Please try again." }));
      }

      if (conversationId && usage.content) {
        await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: usage.content });
      }

      const cost = costUsd("hosted", MODEL_ID, usage);
      await admin.from("ai_usage_events").insert({
        company_id: companyId,
        user_id: user.id,
        model_id: MODEL_ID,
        provider: "hosted",
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: cost,
      });

      controller.enqueue(ndjson({ done: true, usage, costUsd: cost }));
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

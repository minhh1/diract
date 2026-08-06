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
// This POST only creates an ai_chat_jobs row (supabase/migrations/
// 20260807000000_ai_chat_jobs.sql) and returns its id immediately -- the
// actual model/tool-calling turn (below, in runJob) is handed to Next's
// after(), which Vercel keeps the invocation alive for via waitUntil() even
// once the response has been sent. That's what lets the caller close the
// tab mid-build and come back later to find the turn finished -- nothing
// about it depends on the browser staying connected the way a streamed
// response used to. Same shape as app/api/time-entries/auto-generate/route.ts's
// auto_time_entry_generation_jobs (see that file's own header comment).
// AiChatThread.tsx finds/attaches to the job by subscribing to this one row
// via Supabase Realtime for live progress (content/tool_calls, throttled
// writes -- see writeProgress below).
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { callTogetherModelWithTools } from "@/lib/ai/modelCall";
import { TABLE_BUILDER_TOOLS, executeTableBuilderTool } from "@/lib/ai/tableBuilderTools";
import { costUsd, TABLE_BUILDER_MODEL_ID as MODEL_ID } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

// Together-hosted, not Claude -- has a confirmed "Function Calling" badge
// on Together's own model page (unlike DeepSeek V4 Flash, which doesn't),
// which matters here since this whole route only exists to call tools.
// 512K context (not the full 1M DeepSeek V4 Flash claims), ~$1.74/$3.48
// per 1M tokens -- far cheaper than Claude, no separate Anthropic billing
// relationship needed since TOGETHER_API_KEY is already configured for
// this app's other AI features. Imported (not a local const) so the
// research sub-agent in lib/ai/tableBuilderTools.ts's researchTopic stays
// on the exact same model -- see TABLE_BUILDER_MODEL_ID's own comment.

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
- If the user wants to print/export/email records as a PDF (e.g. an invoice, a letter), add a document_export widget (add_widget's document_export_style + field-mapping params) instead of saying you can't -- 'invoice' style renders a billing-document layout (invoice number/date, bill-to, one line item per record from its own description/amount fields, subtotal/tax/total); 'letter' style renders a text field's contents onto the company's letterhead (mention it needs a letterhead uploaded first in Settings → Precedents if the export later fails for that reason). Map whichever of the widget's fields make sense to the table's own fields; leave the rest unset. For 'invoice' style, ask which tax scheme applies (add_widget's tax_scheme, e.g. Australia -> GST, EU/UK/Vietnam -> VAT, US -> Sales Tax) if the company's location isn't already obvious from context, and ask whether they want payment details (bank/account info, a payment link, etc.) printed on the invoice (add_widget's payment_details) -- don't invent either.
- If the user wants to import data from a PDF invoice/receipt into a table (turning an uploaded PDF into new records), add an invoice_import widget (add_widget's description_field_label + amount_field_label required, plus optional supplier_name_field_label/invoice_number_field_label/invoice_date_field_label) instead of saying you can't. You never parse a PDF yourself mid-conversation -- there's no file-upload path into this chat -- the widget just gives a human their own upload button to do that afterward.
- Only propose building/changing something when the user's message actually calls for it. For casual questions or small talk, just answer in plain text.
- If you're genuinely unsure how to proceed (ambiguous requirements, unclear how a new table should relate to what already exists, or a non-obvious design tradeoff) call research with a specific question first, and use its findings before proposing your plan. Don't call it for straightforward builds where the answer is already obvious; it costs extra time and tokens.
- Before calling delete_table, delete_field, remove_widget, or delete_dashboard: first state in your own words exactly what will be deleted and any consequences (e.g. "This will remove the Payroll table and its 3 fields"), and wait for the user's explicit confirmation in their next message. Only then call the tool with confirm=true. If you call a delete tool without the user having agreed first, it will be rejected.
- When you do delete something, mention in your reply that it's restorable afterward via Settings → Trash or Settings → Schema History.
- Keep replies brief and focused on what you did or need to know next.
- Format with real markdown, not run-on prose -- your replies are rendered as HTML. Whenever you list more than one item (fields on a table, tables in a plan, options to choose from), use an actual markdown list: each item on its own line, starting with "- ", not comma/period-separated inside one paragraph. Bold the field/table name (e.g. "- **Client Name** (text, required): core identifier") so it's scannable. Use a heading (### or bold text) to separate each table when laying out a multi-table plan.
- In your replies to the user, never use an em dash, a double hyphen ("--"), or a spaced hyphen (" - ") as a separator. Use a comma, colon, period, or just restructure the sentence instead.`;

interface ToolCallEvent {
  name: string;
  input: Record<string, unknown>;
  phase: "start" | "done";
  isError?: boolean;
}

interface RunJobParams {
  jobId: string;
  admin: any;
  companyId: string;
  userId: string;
  conversationId: string;
  question: string;
  history: ChatMessage[];
}

// Does the actual model/tool-calling turn -- called from after() below, so
// this runs with no live request/response around it at all (nothing here
// may depend on req/res). Writes progress into the job row as it goes
// (throttled, same ~300ms window app/api/time-entries/auto-generate/route.ts's
// writeProgress already uses) so AiChatThread.tsx's Realtime subscription
// sees live content/tool-call updates; a tool call's start/done is always
// force-written regardless of the throttle since those are rare, meaningful
// transitions that would look wrong dropped or delayed.
async function runJob({ jobId, admin, companyId, userId, conversationId, question, history }: RunJobParams): Promise<void> {
  let content = "";
  let reasoning = "";
  const toolCalls: ToolCallEvent[] = [];
  let lastWriteAt = 0;
  const writeProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWriteAt < 300) return;
    lastWriteAt = now;
    admin.from("ai_chat_jobs").update({ content, reasoning, tool_calls: toolCalls, updated_at: new Date().toISOString() }).eq("id", jobId)
      .then(() => {}, (err: unknown) => console.error("[ai chat job] progress write failed:", err));
  };

  try {
    const onDelta = (delta: string) => {
      content += delta;
      writeProgress();
    };
    // Fires at most once (see callTogetherModelWithTools's own comment --
    // reasoning is only requested on the tool loop's first iteration), so
    // this is a plain assignment, not an accumulation.
    const onReasoning = (text: string) => {
      reasoning = text;
      writeProgress(true);
    };
    const onToolCall = (name: string, input: Record<string, unknown>, phase: "start" | "done", isError?: boolean) => {
      if (phase === "start") {
        toolCalls.push({ name, input, phase: "start" });
      } else {
        for (let i = toolCalls.length - 1; i >= 0; i--) {
          if (toolCalls[i].name === name && toolCalls[i].phase === "start") {
            toolCalls[i] = { ...toolCalls[i], phase: "done", isError };
            break;
          }
        }
      }
      writeProgress(true);
    };

    const result = await callTogetherModelWithTools(
      MODEL_ID,
      SYSTEM_PROMPT,
      [...history, { role: "user", content: question }],
      TABLE_BUILDER_TOOLS,
      (name, input) => executeTableBuilderTool(admin, companyId, userId, name, input),
      onDelta,
      onToolCall,
      onReasoning,
      undefined,
      "medium"
    );

    if (result.content) {
      await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: result.content });
    }
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    const cost = costUsd("hosted", MODEL_ID, result);
    await admin.from("ai_usage_events").insert({
      company_id: companyId,
      user_id: userId,
      model_id: MODEL_ID,
      provider: "hosted",
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: cost,
    });

    await admin.from("ai_chat_jobs").update({
      status: "done",
      content: result.content,
      reasoning: result.reasoning,
      tool_calls: toolCalls,
      hit_iteration_limit: result.hitIterationLimit,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (err) {
    // callTogetherModelWithTools already translates request failures into a
    // message meant for an end user -- don't fall back to String(err) here,
    // which would print raw internals for any non-Error throw.
    await admin.from("ai_chat_jobs").update({
      status: "error",
      error: err instanceof Error ? err.message : "Something went wrong talking to the assistant. Please try again.",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
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
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
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
  const { data: existingConversation } = await admin
    .from("ai_conversations")
    .select("company_id, user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (existingConversation && (existingConversation.company_id !== companyId || existingConversation.user_id !== user.id)) {
    return NextResponse.json({ error: "This conversation belongs to a different company or user" }, { status: 403 });
  }
  if (existingConversation) {
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    await admin.from("ai_conversations").insert({ id: conversationId, company_id: companyId, user_id: user.id });
  }
  await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: question });

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("monthly_token_cap, ai_enabled")
    .eq("company_id", companyId)
    .maybeSingle();

  if (settings?.ai_enabled === false) {
    return NextResponse.json({ error: "AI features are disabled for this company" }, { status: 403 });
  }

  const tokenCap = settings?.monthly_token_cap ?? 1000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly token cap reached for this company" }, { status: 429 });
  }

  // Deliberately minimal before responding -- the actual model/tool-calling
  // turn now happens in runJob via after(), not here, so creating a job
  // (and therefore this response) is near-instant regardless of how many
  // steps the turn ends up taking.
  const { data: job, error: jobError } = await admin
    .from("ai_chat_jobs")
    .insert({ conversation_id: conversationId, company_id: companyId, user_id: user.id, status: "running" })
    .select("id")
    .single();
  if (jobError || !job) return NextResponse.json({ error: "Could not start the assistant" }, { status: 500 });

  // Scheduled to run after this response is sent -- Vercel's waitUntil
  // (which this platform's `after` uses under the hood, see this file's
  // header comment) keeps the invocation alive until it finishes, so the
  // caller doesn't have to hold a connection open or stay on this page.
  after(() => runJob({ jobId: job.id, admin, companyId, userId: user.id, conversationId, question, history }));

  return NextResponse.json({ jobId: job.id });
}

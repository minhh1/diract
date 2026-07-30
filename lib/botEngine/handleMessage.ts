// lib/botEngine/handleMessage.ts
// The shared channel-agnostic bot "brain" -- account linking, RAG chat, and
// create/update task/project/file/issue_precedent via tool-calling. Used by
// BOTH the Teams bot (lib/msTeamsBot/handleMessage.ts) and the WhatsApp bot
// (app/api/whatsapp/webhook/[companyId]/route.ts), which previously each had
// their own full copy of this logic, differing only in reply mechanics and
// table names -- extracted here (2026-07-27) so a new action only needs to
// be added once, and so the many documented multi-turn edge cases below
// (greeting detection, tool-call-from-history hijacking, reaction targeting)
// only need to be fixed in one place. A channel's own thin wrapper builds a
// ChannelAdapter for one incoming message and calls handleChannelMessage --
// nothing in this file knows or cares whether it's talking to Bot Framework
// or the WhatsApp Cloud API.
import { resolveSourceTypes, retrieveGroundingContext, buildSystemPrompt } from "@/lib/ai/retrieval";
import { callHostedModel, callHostedModelWithTools, callSelfHostedModel, type ToolCall } from "@/lib/ai/modelCall";
import { buildActionTools, buildMissingFieldsTool, translateFieldAnswers, TOOL_USE_GUARDRAILS, isConversationalOnly } from "@/lib/ai/actionTools";
import { loadFieldConfig, type ActionType, type FieldDef } from "@/lib/ai/actionFields";
import { advanceAction } from "@/lib/ai/actionAdvance";
import {
  resolveTaskByName, resolveStatusByLabel, resolveProjectByName, resolveProfileByName,
  createTask, updateTask, createProject, updateProject, addProjectLabel,
  createOnedriveFile, updateOnedriveFile, isOnedriveConnected,
} from "@/lib/ai/actions";
import { advanceFileAction, buildFileMissingFieldsTool, type FileAdvanceResult } from "@/lib/ai/fileActions";
import {
  advancePrecedentAction, allKnownFields, buildPrecedentMissingFieldsTool, draftSubjectFromCollected, looksLikeDraftRequest,
  type PrecedentAdvanceResult,
} from "@/lib/ai/precedentAction";
import { issuePrecedentDocument } from "@/lib/precedents/issuePrecedent";
import { advanceAppointmentAction, buildAppointmentMissingFieldsTool, type AppointmentAdvanceResult } from "@/lib/ai/appointmentAction";
import { bookAppointment } from "@/lib/ai/calendarBooking";
import { costUsd, HOSTED_MODELS } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";
import { APP_URL } from "@/lib/config";

// Everything a channel needs to plug into the shared engine: which tables
// hold its linked accounts/pending actions/link requests, the column its
// linked-accounts table keys external identity on, its own link page, how
// to actually send a reply, and any extra columns its link-requests table
// needs beyond {code, company_id} -- built fresh per incoming message by
// the channel's own thin wrapper (see lib/msTeamsBot/handleMessage.ts and
// app/api/whatsapp/webhook/[companyId]/route.ts), closing over whatever
// channel-specific context (service URL, credentials, conversation id...)
// it needs to actually send that reply.
export interface ChannelAdapter {
  channel: "teams" | "whatsapp";
  linkedAccountsTable: string;
  pendingActionsTable: string;
  linkRequestsTable: string;
  externalIdColumn: string;
  linkPagePath: string;
  reply(text: string): Promise<string>; // returns a provider message id (for prompt_message_id / reaction matching)
  buildLinkRequestRow(code: string): Record<string, unknown>;
  // Proactively messages a DIFFERENT linked account than the current
  // conversation's -- e.g. asking a configured signer to confirm their
  // signature (see lib/ai/precedentAction.ts's confirming step, and
  // beginOrSkipSignoffRound below). `linkedAccount` is a full row from this
  // channel's own linkedAccountsTable. Returns the sent message's id, or
  // null if they couldn't be reached (no stored service URL yet, WhatsApp's
  // 24h freeform-message window, etc.) so the caller can treat them as
  // unreachable rather than get stuck waiting forever.
  sendProactive(linkedAccount: any, text: string): Promise<string | null>;
}

export interface ChannelMessage {
  externalId: string;
  question: string;
  reactionTargetId?: string;
  isGroup?: boolean;
  // Only Teams sets these -- WhatsApp has no @mention concept, so every
  // group message there is always treated as addressed to the bot. When
  // requiresMentionInGroup is true and wasMentioned is false, an unmentioned
  // group message is only worth a reply if the sender already has a pending
  // action going (see the gate right after `pending` loads below) --
  // otherwise it's the same as any other unrelated message in the channel.
  requiresMentionInGroup?: boolean;
  wasMentioned?: boolean;
  senderName?: string | null;
}

const CONFIRM_WORDS = new Set(["yes", "y", "confirm", "confirmed", "do it", "go ahead", "yep", "yeah"]);

// Appended to every "collecting" question (see the apply*AdvanceResult
// helpers below) -- the equivalent hint already exists on the "confirming"
// step ('Reply "yes" to confirm or "no" to cancel'), but nothing told
// someone stuck answering several collecting questions in a row that they
// could bail out at any point, same as isCancelMessage already supports.
const CANCEL_HINT = '\n\n(Say "cancel" anytime to stop this.)';

// Exact-match only -- these are short/ambiguous enough that matching them
// as a substring would false-positive on unrelated answers (e.g. "no" is a
// substring of "Notary", "stop" of "laptop").
const CANCEL_EXACT_WORDS = new Set(["no", "n", "stop"]);
// Longer, distinctive phrases -- safe to match anywhere in a natural
// sentence. Observed in testing: a real reply like "it's fine, don't
// create, I'll test again tomorrow, good night" isn't equal to any single
// short word, so it fell through and got mistaken for an answer to the
// pending question, and the bot just re-asked it.
const CANCEL_PHRASES = ["don't create", "do not create", "don't bother", "forget it", "not now", "no thanks", "no thank you", "cancel that", "leave it"];
// Unlike "no"/"stop" above, "cancel"/"nevermind" aren't substrings of any
// common unrelated word, so they're safe to match anywhere in the message
// rather than requiring an exact whole-message match. Observed live
// (2026-07-27): a real reply of "cancel this" or "@Diract AI please cancel"
// silently failed to cancel anything, because it only exact-matched the
// bare word "cancel" with nothing else in the message.
const CANCEL_WORD_PATTERNS = [/\bcancel\b/, /\bnevermind\b/, /\bnever mind\b/];

function isCancelMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    CANCEL_EXACT_WORDS.has(normalized) ||
    CANCEL_PHRASES.some((p) => normalized.includes(p)) ||
    CANCEL_WORD_PATTERNS.some((p) => p.test(normalized))
  );
}

// No per-message model picker (unlike the web chat) -- defaults to the
// same model the web chat UI defaults to on load (models[0]).
const DEFAULT_HOSTED_MODEL_ID = HOSTED_MODELS[0].id;

// The model has no real-time clock during inference -- without being told
// today's actual date, it can't resolve a relative phrase like "tomorrow"
// or "next Wednesday" into an absolute date at all (observed in testing:
// it correctly said it "couldn't understand the date 'tomorrow'"). Included
// in every tool-calling/extraction call so due_date can be given in natural
// language, not just literal YYYY-MM-DD.
function todayContextMessage() {
  const today = new Date();
  const weekday = today.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return {
    role: "system",
    content: `Today is ${weekday}, ${today.toISOString().slice(0, 10)} (YYYY-MM-DD). If the user gives a relative date (e.g. "today", "tomorrow", "next Wednesday", "in 3 days"), convert it to an absolute YYYY-MM-DD date yourself before returning it. A bare weekday name with no qualifier (e.g. just "Monday", not "next Monday" or "this Monday") means the closest upcoming occurrence of that weekday -- today itself if today already is that weekday, otherwise the next one ahead, never one in the past.`,
  };
}

function randomCode(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Observed live (2026-07-27): "put a task in for me" left the assignee
// unfilled ("I need a few more details: Assignee") instead of resolving to
// the sender themselves -- the model has no notion of who it's talking to
// unless told, so first-person phrasing ("me", "myself", "for me") had
// nothing to resolve against. senderName is the channel's own display name
// for whoever sent the current message (Teams: activity.from.name;
// WhatsApp: the contact's profile name) -- close enough to their Diract
// full_name for resolveProfileByName's fuzzy match to still find them.
// Only relevant to assignee_name, so only added to the tool-calling/
// extraction calls that can populate it (create_task's initial call and
// its field-extraction follow-ups), not create_project/create_file/
// issue_precedent, none of which have an assignee concept.
function senderIdentityMessage(msg: ChannelMessage): { role: string; content: string } | null {
  if (!msg.senderName) return null;
  return {
    role: "system",
    content: `You're talking with ${msg.senderName}. If they refer to themselves in first person (e.g. "me", "myself", "I", "assign it to me", "put a task in for me") when specifying who a task should be assigned to, use "${msg.senderName}" as the assignee_name.`,
  };
}

// Same live-discovery GET /api/tags call app/api/ai/models makes for the
// web chat's self-hosted dropdown -- there's no stored "default self-hosted
// model" setting, so this just picks whatever the company's Ollama
// instance reports as available.
async function resolveDefaultSelfHostedModel(ollamaUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.models?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

// Several people can have their own pending create/update flow going at
// once in a shared group/channel -- everything the bot posts there is
// visible to everyone with no other indication of who a prompt/result is
// for, which reads as one shared queue even though the underlying state
// (adapter.pendingActionsTable, keyed by linked_account_id) is already
// isolated per person. Prefixing with the sender's own display name (only
// needed in a group -- a 1:1 chat is unambiguous) makes that isolation
// visible instead of just real.
function attribute(text: string, msg: ChannelMessage): string {
  return msg.isGroup && msg.senderName ? `${msg.senderName}: ${text}` : text;
}

export async function handleChannelMessage(admin: any, companyId: string, adapter: ChannelAdapter, msg: ChannelMessage) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));

  const { data: linked } = await admin
    .from(adapter.linkedAccountsTable)
    .select("id, user_id, ai_conversation_id")
    .eq("company_id", companyId)
    .eq(adapter.externalIdColumn, msg.externalId)
    .maybeSingle();

  if (!linked) {
    // An unmentioned group message from someone who's never linked their
    // account has nothing to do with the bot at all -- most people in a
    // shared group chat never will (see the requiresMentionInGroup gate
    // further down for the equivalent case once they ARE linked).
    if (msg.isGroup && msg.requiresMentionInGroup && !msg.wasMentioned) return;
    const code = randomCode();
    await admin.from(adapter.linkRequestsTable).insert({ code, company_id: companyId, ...adapter.buildLinkRequestRow(code) });
    const linkUrl = `${APP_URL}${adapter.linkPagePath}?code=${code}`;
    await reply(`I don't recognize your account yet. Link it to Diract first, then send your question again: ${linkUrl}`);
    return;
  }

  // A configured signer replying to a proactive "would you like to sign"
  // DM (see lib/ai/precedentAction.ts's confirming step and
  // beginOrSkipSignoffRound below) takes priority over anything else this
  // person might have pending -- it's always a single yes/no, never part
  // of a longer collecting flow, and the conversation it's replying to
  // isn't the one that started the original issuance.
  const { data: pendingSignoff } = await admin
    .from("precedent_signoff_request_signers")
    .select("id, request_id, prompt_message_id")
    .eq("linked_account_id", linked.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingSignoff) {
    const isReactionConfirm = !!msg.reactionTargetId && msg.reactionTargetId === pendingSignoff.prompt_message_id;
    const normalized = msg.question.trim().toLowerCase();
    if (isReactionConfirm || (!msg.reactionTargetId && (CONFIRM_WORDS.has(normalized) || isCancelMessage(msg.question)))) {
      const confirmed = isReactionConfirm || CONFIRM_WORDS.has(normalized);
      await admin.from("precedent_signoff_request_signers")
        .update({ status: confirmed ? "confirmed" : "declined", responded_at: new Date().toISOString() })
        .eq("id", pendingSignoff.id);
      await reply(confirmed ? "Thanks — I've noted you'll sign this document." : "No problem, I won't include your signature.");
      await maybeFinalizeSignoffRequest(admin, adapter, pendingSignoff.request_id);
      return;
    }
    // Anything else (including an unrelated reaction) falls through to
    // normal handling rather than getting stuck demanding yes/no forever.
  }

  // Loaded before the pending-action check (not just before the RAG path
  // further down) because continuing a "collecting" create_file/update_file/
  // issue_precedent action needs sourceTypes for the drafting call's
  // grounding context.
  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("source_crm, source_gmail, source_whatsapp, source_teams, source_onedrive, self_hosted_ollama_url, monthly_token_cap")
    .eq("company_id", companyId)
    .maybeSingle();
  const sourceTypes = resolveSourceTypes(settings);

  // A pending create/update-task/project/file/issue_precedent action takes
  // priority over everything else. Two sub-states: "collecting" (still
  // gathering required fields) and "confirming" (fully resolved, just
  // needs yes/no). Anything other than a clear confirm/cancel word during
  // "confirming" falls through and is treated as a brand new message
  // instead (the stale pending action is simply discarded rather than left
  // to confuse a later confirmation).
  const { data: pending } = await admin
    .from(adapter.pendingActionsTable)
    .select("action_type, params, summary, expires_at, status, collected, next_fields, prompt_message_id")
    .eq("linked_account_id", linked.id)
    .maybeSingle();

  // An unmentioned group message (Teams only -- see ChannelMessage's
  // requiresMentionInGroup) is ignored UNLESS this person already has
  // something going with the bot. Observed live (2026-07-27): gating this
  // upstream in parseActivity.ts (before any DB lookup was even possible)
  // meant replying "cancel" -- or anything at all -- to a multi-turn
  // question without re-@mentioning the bot on every single follow-up was
  // silently dropped, leaving the person stuck reseeing the same "collecting"
  // question with no way to escape it.
  if (msg.isGroup && msg.requiresMentionInGroup && !msg.wasMentioned && !pending) {
    return;
  }

  // A "like"/👍 reaction only ever means "confirm" -- and only when it's on
  // the exact confirmation message this pending action's prompt_message_id
  // points at (not just any reaction from this person). No match -> ignore
  // silently rather than guessing; there's nothing sensible to fall
  // through to for a reaction (unlike a mistyped text reply).
  if (msg.reactionTargetId) {
    if (pending && pending.status === "confirming" && pending.prompt_message_id === msg.reactionTargetId && new Date(pending.expires_at) > new Date()) {
      await admin.from(adapter.pendingActionsTable).delete().eq("linked_account_id", linked.id);
      const resultText = await finalizeConfirmedAction(admin, companyId, adapter, linked, pending.action_type, pending.params);
      await reply(resultText);
    }
    return;
  }

  if (pending && new Date(pending.expires_at) > new Date()) {
    const normalized = msg.question.trim().toLowerCase();
    if (isCancelMessage(msg.question)) {
      await admin.from(adapter.pendingActionsTable).delete().eq("linked_account_id", linked.id);
      await reply("Cancelled.");
      return;
    }

    if (pending.status === "collecting") {
      await continueCollecting(admin, companyId, linked, msg, adapter, sourceTypes, pending.action_type, pending.collected ?? {}, pending.next_fields ?? []);
      return;
    }

    // status === "confirming" -- any reply other than yes/no discards the
    // pending row and falls through to be treated as a brand-new message
    // (same as before this phase: don't leave a stale confirmation lying
    // around to confuse a later one).
    await admin.from(adapter.pendingActionsTable).delete().eq("linked_account_id", linked.id);
    if (CONFIRM_WORDS.has(normalized)) {
      const resultText = await finalizeConfirmedAction(admin, companyId, adapter, linked, pending.action_type, pending.params);
      await reply(resultText);
      return;
    }
  }

  const tokenCap = settings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    await reply("This company's monthly AI token cap has been reached -- ask a company admin to raise it in Admin -> AI Assistant.");
    return;
  }

  let conversationId = linked.ai_conversation_id as string | null;
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    await admin.from("ai_conversations").insert({ id: conversationId, company_id: companyId, user_id: linked.user_id });
    await admin.from(adapter.linkedAccountsTable).update({ ai_conversation_id: conversationId }).eq("id", linked.id);
  }
  await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: msg.question });

  const { data: priorMessages } = await admin
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const history = (priorMessages ?? []).slice(0, -1).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

  const ollamaUrl = settings?.self_hosted_ollama_url ?? null;
  const { citations, contextBlock } = await retrieveGroundingContext(admin, companyId, msg.question, sourceTypes, ollamaUrl);
  const systemPrompt = buildSystemPrompt(contextBlock);
  const modelMessages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: msg.question }];

  // No per-message model picker -- hosted defaults to the same model the
  // web chat UI defaults to, self-hosted discovers whatever the company's
  // Ollama actually has live, since there's no stored "default self-hosted
  // model" setting to fall back to.
  const provider: "hosted" | "self_hosted" = ollamaUrl ? "self_hosted" : "hosted";
  let modelId = DEFAULT_HOSTED_MODEL_ID;
  if (provider === "self_hosted") {
    const discovered = await resolveDefaultSelfHostedModel(ollamaUrl!);
    if (!discovered) {
      await reply("No self-hosted model is currently available -- ask a company admin to check the Ollama connection in Admin -> AI Assistant.");
      return;
    }
    modelId = discovered;
  }

  // Tool-calling ("act on the app") is hosted-only -- self-hosted Ollama
  // models vary too much in tool-calling reliability to build real data
  // mutations on top of, so self-hosted just skips straight to plain RAG
  // below. Also skipped for a greeting/filler-only message (see
  // isConversationalOnly) regardless of provider -- TOOL_USE_GUARDRAILS
  // already tells the model not to treat a bare "hi" as license to call a
  // tool, but it doesn't reliably honor that once conversation history
  // contains reconstructable field values (see lib/ai/actionTools.ts's
  // header comment), so this is a hard guarantee rather than another
  // prompt-only attempt.
  if (provider === "hosted" && !isConversationalOnly(msg.question)) {
    let toolResult;
    try {
      const identityMsg = senderIdentityMessage(msg);
      const toolCallMessages = [
        modelMessages[0],
        { role: "system", content: TOOL_USE_GUARDRAILS },
        todayContextMessage(),
        ...(identityMsg ? [identityMsg] : []),
        ...modelMessages.slice(1),
      ];
      const [taskFields, projectFields] = await Promise.all([
        loadFieldConfig(admin, companyId, "create_task"),
        loadFieldConfig(admin, companyId, "create_project"),
      ]);
      toolResult = await callHostedModelWithTools(modelId, toolCallMessages, buildActionTools(taskFields, projectFields));
    } catch (err) {
      console.error("Bot tool-calling call failed, falling back to plain chat:", err);
      toolResult = null;
    }
    if (toolResult) {
      const cost = costUsd(provider, modelId, toolResult);
      await admin.from("ai_usage_events").insert({
        company_id: companyId,
        user_id: linked.user_id,
        model_id: modelId,
        provider,
        input_tokens: toolResult.inputTokens,
        output_tokens: toolResult.outputTokens,
        cost_usd: cost,
      });
      if (toolResult.toolCall) {
        await handleToolCall(admin, companyId, linked, msg, adapter, sourceTypes, toolResult.toolCall);
        return;
      }
      // No tool call -- treat the model's own response as the answer and
      // skip the plain-RAG call below (would otherwise ask the model the
      // same question twice).
      await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: toolResult.content, citations });
      const citationLines = citations.length ? "\n\nSources: " + citations.map((c, i) => `[${i + 1}] ${c.sourceType}`).join(", ") : "";
      await reply(toolResult.content + citationLines);
      return;
    }
  }

  let usage;
  try {
    usage =
      provider === "hosted"
        ? await callHostedModel(modelId, modelMessages)
        : await callSelfHostedModel(ollamaUrl!, modelId, modelMessages);
  } catch (err) {
    await reply("Sorry, I couldn't get an answer just now -- please try again shortly.");
    console.error("Bot model call failed:", err);
    return;
  }

  await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: usage.content, citations });

  const cost = costUsd(provider, modelId, usage);
  await admin.from("ai_usage_events").insert({
    company_id: companyId,
    user_id: linked.user_id,
    model_id: modelId,
    provider,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: cost,
  });

  const citationLines = citations.length
    ? "\n\nSources: " + citations.map((c, i) => `[${i + 1}] ${c.sourceType}`).join(", ")
    : "";
  await reply(usage.content + citationLines);
}

interface LinkedAccount {
  id: string;
  user_id: string;
  ai_conversation_id: string | null;
}

// Resolves the tool call's human-readable references (project/task/
// assignee/status names) to real IDs, and either asks for clarification
// (zero or multiple matches) or stores a pending-action row and replies
// with a plain-language confirmation summary -- nothing is written to
// tasks/projects/documents yet, that only happens once the user confirms.
async function handleToolCall(
  admin: any,
  companyId: string,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  sourceTypes: string[],
  toolCall: ToolCall
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));
  const args = toolCall.arguments as Record<string, string | boolean | undefined>;

  const askAbout = async (kind: string, result: { status: "ambiguous"; candidates: { name: string }[] } | { status: "not_found" }, name: string) => {
    if (result.status === "not_found") {
      await reply(`I couldn't find a ${kind} matching "${name}" -- can you clarify?`);
    } else {
      await reply(`I found multiple ${kind}s matching "${name}": ${result.candidates.map((c) => c.name).join(", ")}. Which one did you mean?`);
    }
  };

  // update_task/update_project stay single-shot (resolve + confirm) --
  // required-field gathering only applies to creation. Always resets
  // status/collected/next_fields explicitly: Supabase's upsert only
  // overwrites the columns present in the payload, so an update_* upsert
  // that omitted these could otherwise leave a stale "collecting" state
  // from an unrelated abandoned create_task/create_project lingering.
  const storePending = async (actionType: string, params: Record<string, unknown>, summary: string) => {
    // Sent first so the returned message id can be stored as
    // prompt_message_id -- a later "like"/👍 reaction is only honored as a
    // confirm when it targets this exact message.
    const promptMessageId = await reply(`${summary}\n\nReply "yes" to confirm or "no" to cancel.`);
    await admin.from(adapter.pendingActionsTable).upsert(
      {
        linked_account_id: linked.id,
        action_type: actionType,
        status: "confirming",
        params,
        summary,
        collected: null,
        next_fields: null,
        prompt_message_id: promptMessageId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "linked_account_id" }
    );
  };

  if (toolCall.name === "create_task" || toolCall.name === "create_project") {
    // args is keyed by whatever buildActionTools exposed -- built-in
    // properties directly, custom fields by a label slug (see
    // lib/ai/actionTools.ts's propertyKeysForFields) -- translateFieldAnswers
    // maps those back to each field's real .key before storing in "collected".
    const fields = await loadFieldConfig(admin, companyId, toolCall.name);
    const collected = translateFieldAnswers(fields, args);
    return applyAdvanceResult(admin, companyId, linked, msg, adapter, toolCall.name, await advanceAction(admin, companyId, toolCall.name, collected));
  }

  if (toolCall.name === "create_file" || toolCall.name === "update_file") {
    const collected: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") collected[key] = String(value);
    }

    // Without OneDrive connected, create_file's own path just writes bare
    // plain text with no letterhead formatting (see lib/ai/botFiles.ts) --
    // observed live (2026-07-28) that this produced an unformatted "letter"
    // with an invented recipient and unfilled placeholder brackets, since
    // nothing ever asked for a real one. Redirecting into issue_precedent's
    // freeform "General Document" path instead reuses the exact same
    // letterhead-based document pipeline a real precedent gets -- real
    // address block, date, salutation, signoff -- for free. update_file
    // isn't redirected: editing a file already sitting in OneDrive or
    // Storage is still a sensible, separate thing to do.
    if (toolCall.name === "create_file" && !(await isOnedriveConnected(admin, companyId))) {
      const redirected: Record<string, string> = { use_ai_fallback: "true" };
      if (collected.project_name) redirected.project_name = collected.project_name;
      if (collected.instructions) redirected.instructions = collected.instructions;
      const result = await advancePrecedentAction(admin, companyId, linked.user_id, DEFAULT_HOSTED_MODEL_ID, sourceTypes, redirected);
      return applyPrecedentAdvanceResult(admin, linked, msg, adapter, "issue_precedent", result);
    }

    const result = await advanceFileAction(admin, companyId, toolCall.name, DEFAULT_HOSTED_MODEL_ID, null, sourceTypes, collected);
    return applyFileAdvanceResult(admin, linked, msg, adapter, toolCall.name, result);
  }

  if (toolCall.name === "issue_precedent") {
    const collected: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") collected[key] = String(value);
    }
    const result = await advancePrecedentAction(admin, companyId, linked.user_id, DEFAULT_HOSTED_MODEL_ID, sourceTypes, collected);
    return applyPrecedentAdvanceResult(admin, linked, msg, adapter, "issue_precedent", result);
  }

  if (toolCall.name === "create_appointment") {
    const collected: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") collected[key] = String(value);
    }
    const result = await advanceAppointmentAction(collected);
    return applyAppointmentAdvanceResult(admin, linked, msg, adapter, "create_appointment", result);
  }

  if (toolCall.name === "update_task") {
    const taskName = args.task_name as string | undefined;
    if (!taskName) return reply("Which task should I update?");

    // A project qualifier (e.g. "task X for project lot 39") scopes the
    // search so the right task is found even when the same task name
    // recurs across projects -- see resolveTaskByName's projectId param.
    let scopeProjectId: string | undefined;
    if (args.project_name) {
      const project = await resolveProjectByName(admin, companyId, args.project_name as string);
      if (project.status !== "found") return askAbout("project", project, args.project_name as string);
      scopeProjectId = project.match.id;
    }

    const task = await resolveTaskByName(admin, companyId, taskName, scopeProjectId);
    if (task.status !== "found") return askAbout("task", task, taskName);

    let assigneeId: string | null | undefined;
    if (args.assignee_name) {
      const assignee = await resolveProfileByName(admin, companyId, args.assignee_name as string);
      if (assignee.status !== "found") return askAbout("person", assignee, args.assignee_name as string);
      assigneeId = assignee.match.id;
    }
    let statusId: string | null | undefined;
    if (args.status) {
      const status = await resolveStatusByLabel(admin, args.status as string);
      if (status.status !== "found") return askAbout("status", status, args.status as string);
      statusId = status.match.id;
    }
    let moveToProjectId: string | undefined;
    if (args.new_project_name) {
      const newProject = await resolveProjectByName(admin, companyId, args.new_project_name as string);
      if (newProject.status !== "found") return askAbout("project", newProject, args.new_project_name as string);
      moveToProjectId = newProject.match.id;
    }

    const changes: string[] = [];
    if (args.new_name) changes.push(`rename to "${args.new_name}"`);
    if (args.due_date) changes.push(`due date to ${args.due_date}`);
    if (assigneeId) changes.push(`assignee to ${args.assignee_name}`);
    if (statusId) changes.push(`status to ${args.status}`);
    if (moveToProjectId) changes.push(`move to project ${args.new_project_name}`);
    if (args.is_completed !== undefined) changes.push(args.is_completed ? "mark complete" : "reopen");
    if (args.notes) changes.push("update notes");
    const summary = `I'll update task "${task.match.name}": ${changes.join(", ") || "no changes recognized"}.`;

    return storePending(
      "update_task",
      {
        taskId: task.match.id,
        name: args.new_name ?? undefined,
        dueDate: args.due_date ?? undefined,
        assigneeId,
        statusId,
        isCompleted: args.is_completed,
        notes: args.notes ?? undefined,
        projectId: moveToProjectId,
      },
      summary
    );
  }

  if (toolCall.name === "update_project") {
    const projectName = args.project_name as string | undefined;
    if (!projectName) return reply("Which project should I update? (name or matter number)");
    const project = await resolveProjectByName(admin, companyId, projectName);
    if (project.status !== "found") return askAbout("project", project, projectName);

    const changes: string[] = [];
    if (args.new_name) changes.push(`rename to "${args.new_name}"`);
    if (args.status) changes.push(`status to ${args.status}`);
    if (args.description) changes.push("update description");
    const summary = `I'll update project "${project.match.name}": ${changes.join(", ") || "no changes recognized"}.`;

    return storePending(
      "update_project",
      { projectId: project.match.id, name: args.new_name ?? undefined, description: args.description ?? undefined, status: args.status },
      summary
    );
  }

  if (toolCall.name === "add_project_label") {
    const projectName = args.project_name as string | undefined;
    if (!projectName) return reply("Which project should I apply a Gmail label to? (name or matter number)");
    const project = await resolveProjectByName(admin, companyId, projectName);
    if (project.status !== "found") return askAbout("project", project, projectName);

    return storePending(
      "add_project_label",
      { projectId: project.match.id },
      `I'll apply a Gmail label to project "${project.match.name}".`
    );
  }

  await reply("I didn't understand that request.");
}

// Persists an advanceAction result (either "still need these fields, asked
// in one combined message" or "fully resolved, ready to confirm") and
// sends the corresponding reply. Shared by handleToolCall's first pass and
// continueCollecting's follow-up passes below -- one place that knows how
// a lib/ai/actionAdvance.ts result maps onto a pending-actions row.
async function applyAdvanceResult(
  admin: any,
  companyId: string,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  actionType: string,
  result: Awaited<ReturnType<typeof advanceAction>>
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (result.status === "collecting") {
    await admin.from(adapter.pendingActionsTable).upsert(
      {
        linked_account_id: linked.id,
        action_type: actionType,
        status: "collecting",
        collected: result.collected,
        next_fields: result.missingFields,
        params: null,
        summary: null,
        prompt_message_id: null,
        expires_at: expiresAt,
      },
      { onConflict: "linked_account_id" }
    );
    return reply(result.question + CANCEL_HINT);
  }

  const promptMessageId = await reply(`${result.summary}\n\nReply "yes" to confirm or "no" to cancel.`);
  await admin.from(adapter.pendingActionsTable).upsert(
    {
      linked_account_id: linked.id,
      action_type: actionType,
      status: "confirming",
      params: result.params,
      summary: result.summary,
      collected: null,
      next_fields: null,
      prompt_message_id: promptMessageId,
      expires_at: expiresAt,
    },
    { onConflict: "linked_account_id" }
  );
}

// Mirrors applyAdvanceResult exactly, for lib/ai/fileActions.ts's
// FileAdvanceResult shape -- kept separate rather than unioning the result
// types, since create_task/create_project's params/collected shapes and
// file/precedent actions' don't overlap meaningfully.
async function applyFileAdvanceResult(
  admin: any,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  actionType: string,
  result: FileAdvanceResult
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (result.status === "collecting") {
    await admin.from(adapter.pendingActionsTable).upsert(
      { linked_account_id: linked.id, action_type: actionType, status: "collecting", collected: result.collected, next_fields: result.missingFields, params: null, summary: null, prompt_message_id: null, expires_at: expiresAt },
      { onConflict: "linked_account_id" }
    );
    return reply(result.question + CANCEL_HINT);
  }

  const promptMessageId = await reply(`${result.summary}\n\nReply "yes" to confirm or "no" to cancel.`);
  await admin.from(adapter.pendingActionsTable).upsert(
    { linked_account_id: linked.id, action_type: actionType, status: "confirming", params: result.params, summary: result.summary, collected: null, next_fields: null, prompt_message_id: promptMessageId, expires_at: expiresAt },
    { onConflict: "linked_account_id" }
  );
}

// Mirrors applyFileAdvanceResult, for lib/ai/precedentAction.ts's
// PrecedentAdvanceResult shape.
async function applyPrecedentAdvanceResult(
  admin: any,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  actionType: string,
  result: PrecedentAdvanceResult
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (result.status === "collecting") {
    await admin.from(adapter.pendingActionsTable).upsert(
      { linked_account_id: linked.id, action_type: actionType, status: "collecting", collected: result.collected, next_fields: result.missingFields, params: null, summary: null, prompt_message_id: null, expires_at: expiresAt },
      { onConflict: "linked_account_id" }
    );
    return reply(result.question + CANCEL_HINT);
  }

  const promptMessageId = await reply(`${result.summary}\n\nReply "yes" to confirm or "no" to cancel.`);
  await admin.from(adapter.pendingActionsTable).upsert(
    { linked_account_id: linked.id, action_type: actionType, status: "confirming", params: result.params, summary: result.summary, collected: null, next_fields: null, prompt_message_id: promptMessageId, expires_at: expiresAt },
    { onConflict: "linked_account_id" }
  );
}

// Mirrors applyFileAdvanceResult, for lib/ai/appointmentAction.ts's
// AppointmentAdvanceResult shape.
async function applyAppointmentAdvanceResult(
  admin: any,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  actionType: string,
  result: AppointmentAdvanceResult
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (result.status === "collecting") {
    await admin.from(adapter.pendingActionsTable).upsert(
      { linked_account_id: linked.id, action_type: actionType, status: "collecting", collected: result.collected, next_fields: result.missingFields, params: null, summary: null, prompt_message_id: null, expires_at: expiresAt },
      { onConflict: "linked_account_id" }
    );
    return reply(result.question + CANCEL_HINT);
  }

  const promptMessageId = await reply(`${result.summary}\n\nReply "yes" to confirm or "no" to cancel.`);
  await admin.from(adapter.pendingActionsTable).upsert(
    { linked_account_id: linked.id, action_type: actionType, status: "confirming", params: result.params, summary: result.summary, collected: null, next_fields: null, prompt_message_id: promptMessageId, expires_at: expiresAt },
    { onConflict: "linked_account_id" }
  );
}

// Handles a reply that arrives while a create_task/create_project/
// create_file/update_file/issue_precedent is still "collecting" (see the
// pending-action check in handleChannelMessage). Since the bot always asks
// for everything still missing in one combined message, the reply might
// answer several of those fields in free text at once -- extraction pulls
// out whichever of `pendingFieldKeys` the reply actually addresses (never
// all of them, and never invented), then the action is re-advanced with the
// merged answers.
async function continueCollecting(
  admin: any,
  companyId: string,
  linked: LinkedAccount,
  msg: ChannelMessage,
  adapter: ChannelAdapter,
  sourceTypes: string[],
  actionType: string,
  collectedSoFar: Record<string, string>,
  pendingFieldKeys: string[]
) {
  const reply = (text: string) => adapter.reply(attribute(text, msg));

  // Same hard guarantee as handleChannelMessage's tool-calling gate -- a
  // generic free-text field (e.g. Notes) gives an extraction model just
  // enough rope to misread pure chit-chat ("i wanna say hi") as an intended
  // answer. Skip the extraction call entirely rather than trust it to
  // decline on its own; nothing changed, so expires_at isn't touched.
  if (isConversationalOnly(msg.question)) {
    await reply("Just checking in? I'm still waiting on a few more details before I create this -- let me know when you're ready.");
    return;
  }

  if (actionType === "create_file" || actionType === "update_file") {
    let extracted: Record<string, unknown> = {};
    let plainReply = "";
    try {
      const extraction = await callHostedModelWithTools(
        DEFAULT_HOSTED_MODEL_ID,
        [
          { role: "system", content: "Extract only the details the user's message actually answers. Never invent or guess a value for anything it doesn't address." },
          { role: "user", content: msg.question },
        ],
        buildFileMissingFieldsTool(actionType, pendingFieldKeys)
      );
      const cost = costUsd("hosted", DEFAULT_HOSTED_MODEL_ID, extraction);
      await admin.from("ai_usage_events").insert({
        company_id: companyId,
        user_id: linked.user_id,
        model_id: DEFAULT_HOSTED_MODEL_ID,
        provider: "hosted",
        input_tokens: extraction.inputTokens,
        output_tokens: extraction.outputTokens,
        cost_usd: cost,
      });
      if (extraction.toolCall) extracted = extraction.toolCall.arguments;
      else plainReply = extraction.content?.trim() ?? "";
    } catch (err) {
      console.error("Bot file field-extraction call failed:", err);
    }

    // Nothing was actually answered -- tool_choice is "auto", so the model
    // was free to recognize this message wasn't an attempt to address the
    // pending question(s) and just replied to it directly instead (e.g. a
    // stray "hi are you there" hours later). Surface that reply rather
    // than silently re-asking the identical question with no
    // acknowledgment of what was actually said -- and, since nothing
    // changed, skip applyFileAdvanceResult so its upsert doesn't refresh
    // expires_at and keep an unrelated conversation alive indefinitely.
    if (!Object.keys(extracted).length && plainReply) {
      await reply(plainReply);
      return;
    }

    const merged = { ...collectedSoFar };
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") merged[key] = String(value);
    }
    const result = await advanceFileAction(admin, companyId, actionType, DEFAULT_HOSTED_MODEL_ID, null, sourceTypes, merged);
    await applyFileAdvanceResult(admin, linked, msg, adapter, actionType, result);
    return;
  }

  if (actionType === "create_appointment") {
    let extracted: Record<string, unknown> = {};
    let plainReply = "";
    try {
      const extraction = await callHostedModelWithTools(
        DEFAULT_HOSTED_MODEL_ID,
        [
          { role: "system", content: "Extract only the details the user's message actually answers. Never invent or guess a value for anything it doesn't address." },
          todayContextMessage(),
          { role: "user", content: msg.question },
        ],
        buildAppointmentMissingFieldsTool(pendingFieldKeys)
      );
      const cost = costUsd("hosted", DEFAULT_HOSTED_MODEL_ID, extraction);
      await admin.from("ai_usage_events").insert({
        company_id: companyId,
        user_id: linked.user_id,
        model_id: DEFAULT_HOSTED_MODEL_ID,
        provider: "hosted",
        input_tokens: extraction.inputTokens,
        output_tokens: extraction.outputTokens,
        cost_usd: cost,
      });
      if (extraction.toolCall) extracted = extraction.toolCall.arguments;
      else plainReply = extraction.content?.trim() ?? "";
    } catch (err) {
      console.error("Bot appointment field-extraction call failed:", err);
    }

    if (!Object.keys(extracted).length && plainReply) {
      await reply(plainReply);
      return;
    }

    const merged = { ...collectedSoFar };
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") merged[key] = String(value);
    }
    const result = await advanceAppointmentAction(merged);
    await applyAppointmentAdvanceResult(admin, linked, msg, adapter, actionType, result);
    return;
  }

  if (actionType === "issue_precedent") {
    // Special case: a single confirm_ai_fallback question is a plain yes/no
    // ("write this with AI instead?"), not a field to extract -- checked
    // directly against CONFIRM_WORDS (see advancePrecedentAction's
    // not_found handling), never through AI extraction. A non-confirm
    // reply is treated as a fresh precedent name to try instead.
    if (pendingFieldKeys.length === 1 && pendingFieldKeys[0] === "confirm_ai_fallback") {
      const merged = { ...collectedSoFar };
      if (CONFIRM_WORDS.has(msg.question.trim().toLowerCase())) merged.use_ai_fallback = "true";
      else merged.precedent_name = msg.question.trim();
      const result = await advancePrecedentAction(admin, companyId, linked.user_id, DEFAULT_HOSTED_MODEL_ID, sourceTypes, merged);
      await applyPrecedentAdvanceResult(admin, linked, msg, adapter, actionType, result);
      return;
    }

    // Special case: a reply to the subject-line question that reads as
    // "you draft it" gets a subject drafted from the matter's own data
    // instead of being parsed as a literal subject (see looksLikeDraftRequest).
    if (pendingFieldKeys.includes("subject") && looksLikeDraftRequest(msg.question)) {
      const draft = await draftSubjectFromCollected(admin, companyId, DEFAULT_HOSTED_MODEL_ID, collectedSoFar);
      if (draft) {
        const cost = costUsd("hosted", DEFAULT_HOSTED_MODEL_ID, draft);
        await admin.from("ai_usage_events").insert({
          company_id: companyId, user_id: linked.user_id, model_id: DEFAULT_HOSTED_MODEL_ID, provider: "hosted",
          input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
        });
        const merged = { ...collectedSoFar, subject: draft.subject };
        const result = await advancePrecedentAction(admin, companyId, linked.user_id, DEFAULT_HOSTED_MODEL_ID, sourceTypes, merged);
        await applyPrecedentAdvanceResult(admin, linked, msg, adapter, actionType, result);
        return;
      }
      // Drafting failed (or the precedent/matter couldn't be re-resolved) --
      // fall through to normal extraction rather than getting stuck.
    }

    const allFields = await allKnownFields(admin, companyId, collectedSoFar);
    const pendingFields = allFields.filter((f) => pendingFieldKeys.includes(f.key));

    let extracted: Record<string, unknown> = {};
    let plainReply = "";
    try {
      const extraction = await callHostedModelWithTools(
        DEFAULT_HOSTED_MODEL_ID,
        [
          { role: "system", content: "Extract only the details the user's message actually answers. Never invent or guess a value for anything it doesn't address." },
          todayContextMessage(),
          { role: "user", content: msg.question },
        ],
        buildPrecedentMissingFieldsTool(pendingFields)
      );
      const cost = costUsd("hosted", DEFAULT_HOSTED_MODEL_ID, extraction);
      await admin.from("ai_usage_events").insert({
        company_id: companyId,
        user_id: linked.user_id,
        model_id: DEFAULT_HOSTED_MODEL_ID,
        provider: "hosted",
        input_tokens: extraction.inputTokens,
        output_tokens: extraction.outputTokens,
        cost_usd: cost,
      });
      if (extraction.toolCall) extracted = extraction.toolCall.arguments;
      else plainReply = extraction.content?.trim() ?? "";
    } catch (err) {
      console.error("Bot precedent field-extraction call failed:", err);
    }

    if (!Object.keys(extracted).length && plainReply) {
      await reply(`${plainReply}\n\n(Still need ${pendingFields.map((f) => f.label).join(", ")} to finish this -- let me know when you're ready.)`);
      return;
    }

    const merged = { ...collectedSoFar };
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") merged[key] = String(value);
    }
    const result = await advancePrecedentAction(admin, companyId, linked.user_id, DEFAULT_HOSTED_MODEL_ID, sourceTypes, merged);
    await applyPrecedentAdvanceResult(admin, linked, msg, adapter, actionType, result);
    return;
  }

  const fieldsForAction = await loadFieldConfig(admin, companyId, actionType as ActionType);
  const pendingFields: FieldDef[] = fieldsForAction.filter((f) => pendingFieldKeys.includes(f.key));

  let extracted: Record<string, unknown> = {};
  let plainReply = "";
  try {
    const identityMsg = senderIdentityMessage(msg);
    const extraction = await callHostedModelWithTools(
      DEFAULT_HOSTED_MODEL_ID,
      [
        { role: "system", content: "Extract only the details the user's message actually answers. Never invent or guess a value for anything it doesn't address." },
        todayContextMessage(),
        ...(identityMsg ? [identityMsg] : []),
        { role: "user", content: msg.question },
      ],
      buildMissingFieldsTool(pendingFields)
    );
    const cost = costUsd("hosted", DEFAULT_HOSTED_MODEL_ID, extraction);
    await admin.from("ai_usage_events").insert({
      company_id: companyId,
      user_id: linked.user_id,
      model_id: DEFAULT_HOSTED_MODEL_ID,
      provider: "hosted",
      input_tokens: extraction.inputTokens,
      output_tokens: extraction.outputTokens,
      cost_usd: cost,
    });
    if (extraction.toolCall) extracted = extraction.toolCall.arguments;
    else plainReply = extraction.content?.trim() ?? "";
  } catch (err) {
    console.error("Bot field-extraction call failed:", err);
  }

  // Same reasoning as the file-action branch above -- don't discard a real
  // conversational reply the model already produced, and don't refresh
  // expires_at (via applyAdvanceResult) when nothing was actually answered.
  if (!Object.keys(extracted).length && plainReply) {
    await reply(`${plainReply}\n\n(Still need ${pendingFields.map((f) => f.label).join(", ")} to finish creating this -- let me know when you're ready.)`);
    return;
  }

  // extracted is keyed by whatever buildMissingFieldsTool exposed (built-in
  // keys directly, custom fields by a label slug) -- translate back to real
  // field.key before merging, same as the initial tool call's args.
  const merged = { ...collectedSoFar, ...translateFieldAnswers(pendingFields, extracted) };

  await applyAdvanceResult(admin, companyId, linked, msg, adapter, actionType, await advanceAction(admin, companyId, actionType as ActionType, merged));
}

// A confirmed issue_precedent needs a detour through the per-signer
// confirmation round (see beginOrSkipSignoffRound) before the document is
// actually issued, if this matter/company has configured signers -- every
// other action type just runs executeAction directly, unchanged.
async function finalizeConfirmedAction(
  admin: any, companyId: string, adapter: ChannelAdapter, linked: LinkedAccount, actionType: string, params: any
): Promise<string> {
  try {
    if (actionType === "issue_precedent") {
      const { data: precedent } = await admin.from("precedents").select("name").eq("id", params.precedentId).maybeSingle();
      return await beginOrSkipSignoffRound(admin, companyId, adapter, linked, precedent?.name || "this document", params);
    }
    return await executeAction(admin, companyId, linked.user_id, actionType, params);
  } catch (err) {
    return `Sorry, that didn't work: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Resolves this matter/company's configured signers (precedent_settings) --
// if none, issues immediately exactly as before this feature existed. If
// there are some, proactively DMs whichever are reachable on this channel
// (see ChannelAdapter.sendProactive) asking if they want to sign, and pauses
// the actual issuing until they've all responded (see
// maybeFinalizeSignoffRequest, triggered by their replies in
// handleChannelMessage's pendingSignoff check above). A configured signer
// with no linked account on this channel can't be asked at all, so they're
// included by default (the same behavior as before this feature existed)
// rather than silently dropped.
async function beginOrSkipSignoffRound(
  admin: any, companyId: string, adapter: ChannelAdapter, linked: LinkedAccount, precedentName: string, issueParams: any
): Promise<string> {
  const issueDirectly = async (signerIds?: string[]) => {
    const result = await issuePrecedentDocument(admin, { ...issueParams, companyId, userId: linked.user_id, signerIds });
    return result.ok ? `Done — issued "${result.subject}": ${result.url}` : `Sorry, that didn't work: ${result.error}`;
  };

  const [{ data: projectSettings }, { data: companySettings }] = await Promise.all([
    admin.from("precedent_settings").select("signers").eq("company_id", companyId).eq("project_id", issueParams.projectId).maybeSingle(),
    admin.from("precedent_settings").select("signers").eq("company_id", companyId).is("project_id", null).maybeSingle(),
  ]);
  const signerIds: string[] = (projectSettings || companySettings)?.signers || [];
  if (!signerIds.length) return issueDirectly(undefined);

  const [{ data: linkedAccounts }, { data: profiles }] = await Promise.all([
    admin.from(adapter.linkedAccountsTable).select("*").eq("company_id", companyId).in("user_id", signerIds),
    admin.from("profiles").select("id, full_name, email").in("id", signerIds),
  ]);
  const linkedByUserId = new Map<string, any>((linkedAccounts || []).map((a: any) => [a.user_id, a]));
  const nameByUserId = new Map<string, string>((profiles || []).map((p: any) => [p.id, p.full_name || p.email || "there"]));

  const baseSignerIds: string[] = [];
  const sentTo: { userId: string; name: string; account: any; messageId: string }[] = [];
  for (const signerId of signerIds) {
    const account = linkedByUserId.get(signerId);
    if (!account) { baseSignerIds.push(signerId); continue; }
    const name = nameByUserId.get(signerId) || "there";
    const messageId = await adapter.sendProactive(
      account,
      `Hi ${name} — I'm issuing "${precedentName}" for a matter you're a configured signer on. Would you like your signature included? Reply yes/no.`
    );
    if (!messageId) { baseSignerIds.push(signerId); continue; }
    sentTo.push({ userId: signerId, name, account, messageId });
  }

  if (!sentTo.length) return issueDirectly(signerIds); // couldn't reach anyone to ask -- fall back to including everyone configured

  const { data: request, error } = await admin.from("precedent_signoff_requests").insert({
    company_id: companyId, project_id: issueParams.projectId, precedent_id: issueParams.precedentId, requested_by: linked.user_id,
    channel: adapter.channel, requester_linked_account_id: linked.id,
    pending_issue_params: { ...issueParams, baseSignerIds },
  }).select("id").single();
  if (error || !request) return `Sorry, I couldn't set up the signature request: ${error?.message}`;

  await admin.from("precedent_signoff_request_signers").insert(
    sentTo.map(s => ({ request_id: request.id, user_id: s.userId, linked_account_id: s.account.id, status: "pending", prompt_message_id: s.messageId }))
  );

  return `I've asked ${sentTo.map(s => s.name).join(", ")} to confirm their signature. I'll issue the document once they respond.`;
}

// Runs once a signer responds (see handleChannelMessage's pendingSignoff
// check) -- if everyone asked has now answered, issues the document with
// only the confirmed signers included and messages the ORIGINAL requester
// (not whichever signer just replied, whose own conversation has nothing to
// do with the issuance itself) via their own linked account.
async function maybeFinalizeSignoffRequest(admin: any, adapter: ChannelAdapter, requestId: string) {
  const { data: signers } = await admin.from("precedent_signoff_request_signers").select("user_id, status").eq("request_id", requestId);
  if (!signers?.length || signers.some((s: any) => s.status === "pending")) return;

  const { data: request } = await admin.from("precedent_signoff_requests").select("*").eq("id", requestId).maybeSingle();
  if (!request || request.status !== "awaiting_signoffs") return;

  const confirmedSignerIds = signers.filter((s: any) => s.status === "confirmed").map((s: any) => s.user_id);
  const { baseSignerIds, ...issueParams } = request.pending_issue_params as any;
  const finalSignerIds = [...(baseSignerIds || []), ...confirmedSignerIds];

  let resultText: string;
  try {
    const result = await issuePrecedentDocument(admin, { ...issueParams, companyId: request.company_id, userId: request.requested_by, signerIds: finalSignerIds });
    resultText = result.ok ? `Done — issued "${result.subject}": ${result.url}` : `Sorry, that didn't work: ${result.error}`;
  } catch (err) {
    resultText = `Sorry, that didn't work: ${err instanceof Error ? err.message : String(err)}`;
  }

  await admin.from("precedent_signoff_requests").update({ status: "issued" }).eq("id", requestId);

  const { data: requesterAccount } = await admin.from(adapter.linkedAccountsTable).select("*").eq("id", request.requester_linked_account_id).maybeSingle();
  if (requesterAccount) await adapter.sendProactive(requesterAccount, resultText);
}

// Runs the actual mutation once a pending action has been confirmed. Never
// called with unresolved names -- params were already fully resolved to
// real IDs when the pending action was stored (see handleToolCall above).
async function executeAction(admin: any, companyId: string, userId: string, actionType: string, params: any): Promise<string> {
  if (actionType === "create_task") {
    const task = await createTask(admin, companyId, userId, params);
    return `Done — created task "${task.name}".`;
  }
  if (actionType === "update_task") {
    await updateTask(admin, companyId, userId, params);
    return "Done — updated the task.";
  }
  if (actionType === "create_project") {
    const project = await createProject(admin, companyId, userId, params);
    return `Done — created project "${project.name}".`;
  }
  if (actionType === "update_project") {
    await updateProject(admin, companyId, params);
    return "Done — updated the project.";
  }
  if (actionType === "add_project_label") {
    const result = await addProjectLabel(admin, companyId, userId, params.projectId);
    return result.existed
      ? `That project already has a Gmail label: ${result.labelName}`
      : `Done — created Gmail label "${result.labelName}". It'll sync to everyone's mailbox shortly.`;
  }
  if (actionType === "create_file") {
    const file = await createOnedriveFile(admin, companyId, userId, params);
    return `Done — created "${file.name}": ${file.webUrl}`;
  }
  if (actionType === "update_file") {
    const file = await updateOnedriveFile(admin, companyId, params.itemId, params.content);
    return `Done — updated the file: ${file.webUrl}`;
  }
  if (actionType === "create_appointment") {
    const booked = await bookAppointment(admin, companyId, params);
    return `Done — booked "${params.name}" on ${params.date} at ${params.startTime}.${booked.htmlLink ? ` ${booked.htmlLink}` : ""}`;
  }
  // issue_precedent is never routed here -- finalizeConfirmedAction handles
  // it directly via beginOrSkipSignoffRound, since it needs the channel
  // adapter (to proactively message signers) that this function doesn't have.
  return "Unknown action type.";
}

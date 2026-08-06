// lib/ai/modelCall.ts
// Calls the hosted (Together) or self-hosted (Ollama) chat completion
// endpoint and accumulates the full response, token usage included.
// Shared by app/api/ai/chat/route.ts (streams each delta to the browser
// via onDelta) and app/api/teams/bot/[companyId]/route.ts (omits onDelta --
// Teams has no use for token-by-token deltas, just the final text).
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

// Together's own rate limits scale automatically with the account's
// cumulative spend (no manual "request an increase" -- confirmed live,
// 2026-08-06) -- a burst of requests in a short window (a multi-step
// table/dashboard build, several people chatting at once, ...) can still
// hit a transient 429 well within normal usage. Retried here, once, for
// every Together call site in this file, rather than surfacing it straight
// to the user as "something went wrong" for what's usually a ~2s blip.
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchTogetherWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) return res;
    // Together's own 429 body names this header as the retry window
    // ("Retry starting from ~2s (X-RateLimit-Reset header)") -- fall back
    // to a short exponential backoff if it's missing or not a plausible
    // small number of seconds (format isn't documented precisely enough to
    // trust blindly).
    const resetHeader = Number(res.headers.get("X-RateLimit-Reset"));
    const waitMs = Number.isFinite(resetHeader) && resetHeader > 0 && resetHeader < 60
      ? resetHeader * 1000
      : 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// Plain JSON-Schema tool definition -- provider-neutral. callTogetherModelWithTools
// (below) wraps this in the OpenAI-compatible {type: "function", function: {...}}
// envelope Together's API expects. Defined here (not in lib/ai/tableBuilderTools.ts,
// the one current caller) since this is the provider-calling layer that owns
// the wire format -- tableBuilderTools.ts imports this type, not the reverse.
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  content: string;
}

export async function callHostedModel(
  modelId: string,
  messages: unknown[],
  onDelta?: (delta: string) => void,
  maxTokens?: number
): Promise<TokenUsage> {
  const body: Record<string, unknown> = { model: modelId, messages, stream: true, stream_options: { include_usage: true } };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await fetchTogetherWithRetry("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Together chat completion failed: ${res.status} ${await res.text()}`);

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, content: "" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return usage;
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        onDelta?.(delta);
        usage.content += delta;
      }
      if (json.usage) {
        usage.inputTokens = json.usage.prompt_tokens ?? 0;
        usage.outputTokens = json.usage.completion_tokens ?? 0;
      }
    }
  }
  return usage;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult extends TokenUsage {
  toolCall: ToolCall | null;
}

// Non-streaming tool-calling variant, used only by the Teams bot's
// "act on the app" capability (see app/api/teams/bot/[companyId]/route.ts,
// lib/ai/actionTools.ts) -- a tool-call decision isn't meaningfully
// streamed token-by-token, and the bot is already non-streaming. Hosted
// (Together) only: self-hosted Ollama models vary too much in tool-calling
// reliability to build data-mutating actions on top of, so the bot skips
// straight to plain RAG chat (callHostedModel/callSelfHostedModel above)
// for self-hosted companies.
export async function callHostedModelWithTools(
  modelId: string,
  messages: unknown[],
  tools: unknown[]
): Promise<ToolCallResult> {
  const res = await fetchTogetherWithRetry("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({ model: modelId, messages, tools, tool_choice: "auto", stream: false }),
  });
  if (!res.ok) throw new Error(`Together tool-calling completion failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const message = json.choices?.[0]?.message ?? {};
  const rawToolCall = message.tool_calls?.[0];

  let toolCall: ToolCall | null = null;
  if (rawToolCall?.function?.name) {
    try {
      toolCall = { name: rawToolCall.function.name, arguments: JSON.parse(rawToolCall.function.arguments || "{}") };
    } catch {
      toolCall = null;
    }
  }

  return {
    toolCall,
    content: message.content ?? "",
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

export async function callSelfHostedModel(
  ollamaUrl: string,
  modelId: string,
  messages: unknown[],
  onDelta?: (delta: string) => void
): Promise<TokenUsage> {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama chat completion failed: ${res.status} ${await res.text()}`);

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, content: "" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const json = JSON.parse(line);
      const delta = json.message?.content;
      if (delta) {
        onDelta?.(delta);
        usage.content += delta;
      }
      if (json.done) {
        usage.inputTokens = json.prompt_eval_count ?? 0;
        usage.outputTokens = json.eval_count ?? 0;
        return usage;
      }
    }
  }
  return usage;
}

export interface HostedToolExecutionResult {
  content: string;
  isError?: boolean;
}

export type HostedToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<HostedToolExecutionResult>;

// Fired around each individual tool call within a turn -- lets a caller
// (app/api/ai/chat/route.ts) stream live "Creating table 'Invoices'..."
// style progress to the browser instead of the chat going silent for
// however long a multi-step build takes. "start" fires just before
// executeTool runs, "done" right after, carrying whether it errored.
export type HostedToolCallListener = (
  name: string,
  input: Record<string, unknown>,
  phase: "start" | "done",
  isError?: boolean
) => void;

const MAX_TOOL_LOOP_ITERATIONS = 12;

export interface HostedToolChatResult extends TokenUsage {
  // The final turn's finish_reason ("stop", "tool_calls", "length", ...) --
  // null only if the loop never got a response at all (shouldn't happen; a
  // request failure throws instead).
  finishReason: string | null;
  // True when the loop exited because the iteration cap was reached while
  // the model still wanted to keep calling tools (finish_reason was
  // "tool_calls" on every iteration, never naturally settling) -- distinct
  // from hitting the cap on a turn that was actually done. Without this, a
  // long multi-step build just silently stops mid-task with no indication
  // anything was cut short.
  hitIterationLimit: boolean;
  // The model's own chain-of-thought for whichever turn produced it (see
  // reasoningEffort param below) -- empty string if reasoning wasn't
  // requested, or if the provider didn't return any (e.g. possibly
  // suppressed on a turn that's also making tool calls -- unconfirmed,
  // callers should treat an empty value as "nothing to show", not an
  // error).
  reasoning: string;
}

function toOpenAiTools(tools: ToolSchema[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

// Multi-turn agentic tool-calling loop against Together's OpenAI-compatible
// endpoint (see app/api/ai/chat/route.ts, lib/ai/tableBuilderTools.ts).
// Deliberately NON-streaming per turn (onDelta fires once per completed
// turn, not token-by-token) -- callHostedModelWithTools above already
// established stream:false for Together tool-calling in this codebase;
// hand-accumulating tool_call argument fragments across a streaming SSE
// response (indexed, partial-JSON deltas) is real complexity this repo has
// no precedent for and no easy way to verify against Together's actual
// wire behavior, whereas the non-streaming response shape is already
// proven here. Unlike callHostedModelWithTools (which only reads
// message.tool_calls?.[0]), this executes every tool call in a turn and
// loops on finish_reason === "tool_calls" until the model is done.
export async function callTogetherModelWithTools(
  modelId: string,
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  tools: ToolSchema[],
  executeTool: HostedToolExecutor,
  onDelta?: (delta: string) => void,
  onToolCall?: HostedToolCallListener,
  onReasoning?: (text: string) => void,
  maxIterations: number = MAX_TOOL_LOOP_ITERATIONS,
  // Confirmed live (Together AI's own chat-completions reference) that
  // deepseek-ai/DeepSeek-V4-Pro supports this, returning real chain-of-
  // thought in message.reasoning (separate from message.content) -- only
  // applied on the FIRST iteration (i === 0), not every turn: reasoning
  // tokens bill as output tokens at the same rate as everything else, and
  // a build can run up to maxIterations turns, so requesting it on every
  // mechanical create_field turn would multiply cost for little value. The
  // first turn -- deciding what to build -- is the one actually worth
  // seeing the model think through.
  reasoningEffort?: "low" | "medium" | "high"
): Promise<HostedToolChatResult> {
  const openAiTools = toOpenAiTools(tools);
  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, content: "" };
  let finishReason: string | null = null;
  let reasoning = "";

  for (let i = 0; i < maxIterations; i++) {
    // Confirmed live: Together sometimes returns a message.reasoning blob
    // on iterations OTHER than i===0 too, even though reasoning_effort is
    // only ever requested on the first one below -- and reasoning tokens
    // count against the same per-call output budget as content. Without an
    // explicit max_tokens, a verbose unrequested reasoning trace on a later
    // iteration once consumed the whole default budget and left content
    // truncated to empty, silently ending the turn (finish_reason "length"
    // isn't "tool_calls", so the loop below just breaks). 6000 is generous
    // enough to cover a large reasoning trace plus a full multi-table plan
    // in the same call.
    const body: Record<string, unknown> = { model: modelId, messages, tools: openAiTools, tool_choice: "auto", stream: false, max_tokens: 6000 };
    if (i === 0 && reasoningEffort) body.reasoning_effort = reasoningEffort;
    const res = await fetchTogetherWithRetry("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[callTogetherModelWithTools] request failed:", res.status, errText);
      throw new Error("Something went wrong talking to the assistant. Please try again.");
    }

    const json = await res.json();
    const message = json.choices?.[0]?.message ?? {};
    finishReason = json.choices?.[0]?.finish_reason ?? null;
    usage.inputTokens += json.usage?.prompt_tokens ?? 0;
    usage.outputTokens += json.usage?.completion_tokens ?? 0;

    if (message.content) {
      onDelta?.(message.content);
      usage.content += message.content;
    }
    if (typeof message.reasoning === "string" && message.reasoning) {
      reasoning = message.reasoning;
      onReasoning?.(reasoning);
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });

    const rawToolCalls: { id: string; function?: { name?: string; arguments?: string } }[] =
      Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (finishReason !== "tool_calls" || rawToolCalls.length === 0) break;

    for (const call of rawToolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // Malformed JSON from the model -- fall through with an empty
        // input rather than crashing the whole turn; the tool executor
        // will reject it as a bad call and the model can retry.
      }
      const toolName = call.function?.name ?? "";
      onToolCall?.(toolName, input, "start");
      const result = await executeTool(toolName, input);
      onToolCall?.(toolName, input, "done", result.isError);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  // Only true when every single iteration ended in tool_calls and the loop
  // ran out of room while the model still wanted to keep going -- if it
  // ever naturally settled (stop/length/...), finishReason holds that real
  // reason instead, whichever iteration produced it.
  const hitIterationLimit = finishReason === "tool_calls";
  return { ...usage, finishReason, hitIterationLimit, reasoning };
}

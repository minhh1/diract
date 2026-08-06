// lib/billing/aiModels.ts
import { PLATFORM_AI_SERVICE_FEE_USD_PER_1K_TOKENS } from "@/lib/billing/plans";

// Static, hand-curated catalog of open-weight models available through the
// platform-hosted inference provider (Together AI), mirroring
// lib/vmProviders/pricing.ts's precedent -- a live pricing API isn't worth
// integrating for a handful of models that change price rarely. Refresh by
// hand periodically; last checked 2026-07-21.
//
// Self-hosted models (from a company's own Ollama, see
// ai_chat_settings.self_hosted_ollama_url) aren't listed here -- they're
// discovered live from `GET {ollama_url}/api/tags` by app/api/ai/models,
// and always billed at PLATFORM_SERVICE_FEE_USD_PER_1K_TOKENS only (see
// lib/billing/plans.ts) since there's no real per-token provider cost to
// pass through.

export interface HostedModel {
  id: string; // Together AI model identifier, used as-is in completion requests
  label: string;
  inputUsdPer1kTokens: number;
  outputUsdPer1kTokens: number;
  contextWindow: number;
}

// Single source of truth for "what model the table/dashboard-builder
// assistant (and its research sub-agent, see lib/ai/tableBuilderTools.ts's
// researchTopic) uses" -- app/api/ai/chat/route.ts imports this instead of
// hardcoding its own copy of the string, so the main assistant and its
// research sub-agent can't silently drift onto different models.
export const TABLE_BUILDER_MODEL_ID = "deepseek-ai/DeepSeek-V4-Pro";

export const HOSTED_MODELS: HostedModel[] = [
  // Used by lib/ai/modelCall.ts's callTogetherModelWithTools (see
  // app/api/ai/chat/route.ts's table/dashboard-builder assistant) -- picked
  // over DeepSeek V4 Flash specifically because Together's own model page
  // shows a confirmed "Function Calling" badge for Pro and not for Flash,
  // which matters since this route only exists to call tools.
  {
    id: TABLE_BUILDER_MODEL_ID,
    label: "DeepSeek V4 Pro",
    inputUsdPer1kTokens: 0.00174,
    outputUsdPer1kTokens: 0.00348,
    contextWindow: 512000,
  },
  {
    id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    label: "Llama 3.3 70B",
    inputUsdPer1kTokens: 0.00088,
    outputUsdPer1kTokens: 0.00088,
    contextWindow: 128000,
  },
  {
    id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    label: "Llama 3.1 8B (fast, cheap)",
    inputUsdPer1kTokens: 0.00018,
    outputUsdPer1kTokens: 0.00018,
    contextWindow: 128000,
  },
  {
    id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
    label: "Qwen 2.5 72B",
    inputUsdPer1kTokens: 0.0012,
    outputUsdPer1kTokens: 0.0012,
    contextWindow: 32000,
  },
  {
    id: "deepseek-ai/DeepSeek-V3",
    label: "DeepSeek V3",
    inputUsdPer1kTokens: 0.00125,
    outputUsdPer1kTokens: 0.00125,
    contextWindow: 64000,
  },
  {
    id: "mistralai/Mixtral-8x22B-Instruct-v0.1",
    label: "Mixtral 8x22B",
    inputUsdPer1kTokens: 0.0012,
    outputUsdPer1kTokens: 0.0012,
    contextWindow: 65536,
  },
  // The one vision-capable model in Together's serverless catalog (used by
  // lib/genericInvoiceParser.ts to read rasterized PDF invoice pages --
  // DeepSeek V4 Pro above is text-only). Last checked 2026-08-06.
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6 (vision)",
    inputUsdPer1kTokens: 0.0012,
    outputUsdPer1kTokens: 0.0045,
    contextWindow: 256000,
  },
];

export function findHostedModel(id: string): HostedModel | undefined {
  return HOSTED_MODELS.find((m) => m.id === id);
}

// Claude models called directly (not through Together) -- e.g.
// lib/disbursementInvoiceParser.ts's PDF document-input extraction, which
// needs Claude's native PDF support (no Together/Ollama model has one;
// lib/genericInvoiceParser.ts, the table-agnostic sibling, instead
// rasterizes pages and uses Together's own vision model, billed via the
// "hosted" catalog above). Materially pricier than the hosted catalog
// ($5/$25 per MTok vs ~$1.74/$3.48 for the table-builder chat's own
// DeepSeek V4 Pro) -- real cost, not billed at the flat self-hosted
// service fee.
export const ANTHROPIC_MODELS: Record<string, { inputUsdPer1kTokens: number; outputUsdPer1kTokens: number }> = {
  "claude-opus-4-8": { inputUsdPer1kTokens: 0.005, outputUsdPer1kTokens: 0.025 },
};

// Shared by app/api/ai/chat/route.ts and app/api/teams/bot/[companyId]/route.ts
// -- self-hosted usage has no real per-token provider cost, so it's billed
// at a flat platform service fee instead (see PLATFORM_AI_SERVICE_FEE_USD_PER_1K_TOKENS
// in lib/billing/plans.ts).
export function costUsd(
  provider: "hosted" | "self_hosted" | "anthropic",
  modelId: string,
  usage: { inputTokens: number; outputTokens: number }
): number {
  if (provider === "self_hosted") {
    return ((usage.inputTokens + usage.outputTokens) / 1000) * PLATFORM_AI_SERVICE_FEE_USD_PER_1K_TOKENS;
  }
  if (provider === "anthropic") {
    const model = ANTHROPIC_MODELS[modelId];
    if (!model) return 0;
    return (usage.inputTokens / 1000) * model.inputUsdPer1kTokens + (usage.outputTokens / 1000) * model.outputUsdPer1kTokens;
  }
  const model = findHostedModel(modelId);
  if (!model) return 0;
  return (usage.inputTokens / 1000) * model.inputUsdPer1kTokens + (usage.outputTokens / 1000) * model.outputUsdPer1kTokens;
}

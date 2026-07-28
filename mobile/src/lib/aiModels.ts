// Trimmed copy of ../../../lib/billing/aiModels.ts's HOSTED_MODELS -- id +
// label only, this app only needs to offer a choice and send the id back,
// not price it (billing/usage accounting happens server-side in
// app/api/ai/chat/route.ts regardless of which client called it).
export const HOSTED_MODELS = [
  { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B' },
  { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B (fast)' },
  { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B' },
  { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
] as const;

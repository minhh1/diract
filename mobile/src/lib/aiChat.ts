import { callApi } from './api';

// Mirrors components/ai/AiChatThread.tsx's types on the web app -- same
// job-based backend (app/api/ai/chat/route.ts creates an ai_chat_jobs row
// and returns its id immediately; the actual turn runs after the response
// via Next's after(), delivered here over Supabase Realtime instead of a
// held-open stream).
export type ToolCallEvent = {
  name: string;
  input: Record<string, unknown>;
  phase: 'start' | 'done';
  isError?: boolean;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallEvent[];
  reasoning?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
};

export type Usage = {
  tokensUsed: number;
  tokenCap: number;
  estimatedCostUsd: number;
  periodEnd: string;
};

async function unwrap<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export async function sendChatMessage(question: string, history: { role: string; content: string }[], conversationId: string): Promise<{ jobId: string }> {
  const res = await callApi('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ question, history, conversationId }),
  });
  return unwrap(res);
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await callApi('/api/ai/conversations');
  const json = await unwrap<{ conversations: ConversationSummary[] }>(res);
  return json.conversations;
}

export async function fetchConversationMessages(id: string): Promise<ChatMessage[]> {
  const res = await callApi(`/api/ai/conversations/${id}`);
  const json = await unwrap<{ messages: { role: 'user' | 'assistant'; content: string }[] }>(res);
  return json.messages;
}

export async function patchConversation(id: string, updates: { title?: string; pinned?: boolean }): Promise<void> {
  const res = await callApi(`/api/ai/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  await unwrap(res);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await callApi(`/api/ai/conversations/${id}`, { method: 'DELETE' });
  await unwrap(res);
}

export async function fetchUsage(): Promise<Usage> {
  const res = await callApi('/api/ai/usage');
  return unwrap(res);
}

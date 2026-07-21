// lib/ai/embeddings.ts
// Embeds a single piece of text (a user's chat question) for nearest-
// neighbor retrieval against ai_document_chunks. Mirrors the embedding
// logic in supabase/functions/ai-embed-worker/index.ts -- kept as a
// separate copy rather than shared, since Edge Functions (Deno) can't
// import this app's lib/ files. Keep both in sync if the embedding model
// ever changes.
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

export async function embedQuery(text: string, ollamaUrl: string | null): Promise<number[] | null> {
  if (TOGETHER_API_KEY) {
    const res = await fetch("https://api.together.xyz/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOGETHER_API_KEY}` },
      body: JSON.stringify({ model: "BAAI/bge-base-en-v1.5", input: [text] }),
    });
    if (!res.ok) throw new Error(`Together embeddings failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.data[0]?.embedding ?? null;
  }

  if (ollamaUrl) {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.embedding ?? null;
  }

  return null;
}

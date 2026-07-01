import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { embed } from "@/lib/jigsawstack";
import { queryTopK } from "@/lib/vector";
import { buildContext, buildSystemPrompt } from "@/lib/rag";
import { interfazeLimiter } from "@/lib/ratelimit";
import { getAllFileStatuses } from "@/lib/redis";

export const dynamic = "force-dynamic";

const interfaze = createOpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

// Minimum cosine similarity (Upstash normalizes to 0..1) for a chunk to count
// as relevant. Below this we drop it rather than feeding noise to the model.
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.7);

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // v6 UI messages carry content in a `parts` array; pull the latest user text.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question = (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();

  // #2 Guard empty question — never embed("") (it can error / waste a call).
  let context = "";
  let sources: string[] = [];
  if (question) {
    const qVec = await embed(question);
    // Over-fetch, then #1 keep only chunks above the relevance threshold.
    const scored = await queryTopK(qVec, 8);
    const relevant = scored.filter((c) => c.score >= MIN_SCORE);
    ({ context, sources } = buildContext(relevant));
  }

  // Corpus inventory so the assistant can answer "what/how many files are
  // indexed" — questions whose answer isn't inside any document's text.
  const statuses = await getAllFileStatuses();
  const indexed = statuses.filter((s) => s.stage === "indexed");
  const manifest = indexed.length
    ? `${indexed.length} file${indexed.length === 1 ? "" : "s"} indexed: ${indexed
        .map((s) => s.name)
        .join(", ")}`
    : "No files are indexed yet.";

  // ASSUMPTION: "interfaze" is a placeholder chat model id. Verify against live
  // Interfaze docs before relying on this in production.
  await interfazeLimiter.acquire();
  const result = streamText({
    model: interfaze.chat("interfaze"),
    system: buildSystemPrompt(context, sources, manifest),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}

import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { embed } from "@/lib/jigsawstack";
import { queryTopK } from "@/lib/vector";
import { buildContext, buildSystemPrompt } from "@/lib/rag";

export const dynamic = "force-dynamic";

const interfaze = createOpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // v6 UI messages carry content in a `parts` array; pull the latest user text.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question = (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();

  const qVec = await embed(question);
  const chunks = await queryTopK(qVec, 6);
  const { context } = buildContext(chunks);

  // ASSUMPTION: "interfaze" is a placeholder chat model id. Verify against live
  // Interfaze docs before relying on this in production.
  const result = streamText({
    model: interfaze.chat("interfaze"),
    system: buildSystemPrompt(context),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}

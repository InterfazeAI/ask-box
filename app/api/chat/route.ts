import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { embed } from "@/lib/jigsawstack";
import { queryTopK } from "@/lib/vector";
import { buildContext, buildSystemPrompt } from "@/lib/rag";

export const dynamic = "force-dynamic";

const interfaze = createOpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const last = [...messages].reverse().find((m: any) => m.role === "user");
  const qVec = await embed(last?.content ?? "");
  const chunks = await queryTopK(qVec, 6);
  const { context } = buildContext(chunks);

  // ASSUMPTION: "interfaze" is a placeholder chat model id, mirroring the
  // assumption already made in Task 8. Verify against live Interfaze docs
  // before relying on this in production.
  const result = streamText({
    model: interfaze("interfaze"),
    system: buildSystemPrompt(context),
    messages,
  });
  return result.toDataStreamResponse();
}

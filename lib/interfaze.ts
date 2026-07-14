import OpenAI from "openai";
import { interfazeLimiter } from "@/lib/ratelimit";

const client = new OpenAI({
  apiKey: process.env.INTERFAZE_API_KEY!,
  baseURL: process.env.INTERFAZE_BASE_URL!,
});

export async function extractText(file: { name: string; buffer: Buffer }): Promise<string> {
  const dataUrl = `data:application/octet-stream;base64,${file.buffer.toString("base64")}`;
  await interfazeLimiter.acquire();
  const res = await client.chat.completions.create({
    model: "interfaze",
    messages: [
      { role: "system", content: "Extract all text content from the document accurately. Return only the extracted text, for pdf use markdown always" },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract the full text from this file` },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

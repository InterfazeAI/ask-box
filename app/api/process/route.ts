import { NextRequest, NextResponse } from "next/server";
import { verifyQstash } from "@/lib/queue";
import { downloadFile } from "@/lib/box";
import { extractText } from "@/lib/interfaze";
import { chunkText } from "@/lib/chunk";
import { embed } from "@/lib/jigsawstack";
import { upsertChunks } from "@/lib/vector";
import { setFileStatus } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!(await verifyQstash(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  let fileId: string;
  try {
    const parsed = JSON.parse(body) as { fileId?: string };
    if (!parsed.fileId) {
      throw new Error("missing fileId");
    }
    fileId = parsed.fileId;
  } catch {
    // Malformed or incomplete body: tell QStash not to retry (400), not a transient failure.
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  let name = fileId;
  try {
    await setFileStatus({ fileId, name, stage: "extracting", updatedAt: Date.now() });
    const file = await downloadFile(fileId);
    name = file.name;
    const text = await extractText(file);
    const chunks = chunkText(text);

    await setFileStatus({ fileId, name, stage: "embedding", updatedAt: Date.now() });
    const items = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = await embed(chunks[i]);
      items.push({ vector, meta: { fileId, fileName: name, chunkIdx: i, text: chunks[i] } });
    }
    await upsertChunks(fileId, items);

    await setFileStatus({ fileId, name, stage: "indexed", chunkCount: chunks.length, updatedAt: Date.now() });
    return NextResponse.json({ ok: true, chunks: chunks.length });
  } catch (err) {
    await setFileStatus({
      fileId, name, stage: "error",
      error: err instanceof Error ? err.message : "unknown error",
      updatedAt: Date.now(),
    });
    // 500 lets QStash retry transient failures
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyQstash } from "@/lib/queue";
import { processFile } from "@/lib/process";

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!(await verifyQstash(req.headers.get("upstash-signature"), body))) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  let boxUserId: string;
  let fileId: string;
  try {
    const parsed = JSON.parse(body) as { boxUserId?: string; fileId?: string };
    if (!parsed.boxUserId || !parsed.fileId) throw new Error("missing fields");
    boxUserId = parsed.boxUserId;
    fileId = parsed.fileId;
  } catch {
    // Malformed or incomplete body: tell QStash not to retry (400), not a transient failure.
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const chunks = await processFile(boxUserId, fileId);
    return NextResponse.json({ ok: true, chunks });
  } catch {
    // processFile already recorded an "error" status. 500 lets QStash retry transient failures.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

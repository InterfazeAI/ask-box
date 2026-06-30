import { NextRequest, NextResponse } from "next/server";
import { isValidWebhookSignature } from "@/lib/box";
import { enqueueProcess } from "@/lib/queue";
import { setFileStatus } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string | null> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  // Dev-only escape hatch: set BOX_WEBHOOK_SKIP_VERIFY=true to accept webhooks
  // without signature keys. INSECURE — never enable in production.
  const skipVerify = process.env.BOX_WEBHOOK_SKIP_VERIFY === "true";
  if (skipVerify) {
    console.warn("[webhook] signature verification SKIPPED (BOX_WEBHOOK_SKIP_VERIFY=true)");
  } else if (!isValidWebhookSignature(body, headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  const evt = JSON.parse(body);
  if (evt.trigger === "FILE.UPLOADED" && evt.source?.id) {
    const fileId = String(evt.source.id);
    await setFileStatus({
      fileId, name: evt.source.name ?? fileId, stage: "queued", updatedAt: Date.now(),
    });
    await enqueueProcess(fileId);
  }
  return NextResponse.json({ ok: true });
}

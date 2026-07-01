import { NextResponse } from "next/server";
import { deleteWebhook } from "@/lib/box";
import { clearBoxTokens, clearWebhookId, getWebhookId } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST() {
  // Best-effort webhook teardown. This runs before we drop the tokens because
  // deleting the webhook needs a valid access token. A failure here (e.g. the
  // webhook was already removed in the Box console) must not block disconnect —
  // clearing our stored tokens is what actually severs the connection.
  const webhookId = await getWebhookId();
  if (webhookId) {
    try {
      await deleteWebhook(webhookId);
    } catch (err) {
      console.warn(
        "[box/disconnect] Failed to delete webhook:",
        err instanceof Error ? err.message : err
      );
    }
  }

  await Promise.all([clearBoxTokens(), clearWebhookId()]);

  return NextResponse.json({ connected: false });
}

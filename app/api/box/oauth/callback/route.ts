import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, createWebhook } from "@/lib/box";
import { setBoxTokens, setWebhookId, getWebhookId } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const tokens = await exchangeCodeForTokens(code);
  await setBoxTokens(tokens);

  // Best-effort webhook registration. This can legitimately fail — Box rejects
  // webhooks targeting the root folder ("0"), and in this deployment the webhook
  // is configured manually in the Box console anyway. A failure here must NEVER
  // break the OAuth flow: the user is already authenticated at this point.
  if (!(await getWebhookId())) {
    try {
      const id = await createWebhook("0"); // folder 0 = All Files
      await setWebhookId(id);
    } catch (err) {
      console.warn(
        "[box/oauth] Skipping programmatic webhook creation:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.redirect(new URL("/", process.env.APP_URL!));
}

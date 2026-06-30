import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, createWebhook } from "@/lib/box";
import { setBoxTokens, setWebhookId, getWebhookId } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  const tokens = await exchangeCodeForTokens(code);
  await setBoxTokens(tokens);
  if (!(await getWebhookId())) {
    const id = await createWebhook("0"); // folder 0 = All Files
    await setWebhookId(id);
  }
  return NextResponse.redirect(new URL("/", process.env.APP_URL!));
}

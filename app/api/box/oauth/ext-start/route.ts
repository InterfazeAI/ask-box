import { NextRequest, NextResponse } from "next/server";
import { getExtensionAuthorizeUrl, isValidExtensionRedirectUri } from "@/lib/box";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const redirectUri = req.nextUrl.searchParams.get("redirect_uri");
  const state = req.nextUrl.searchParams.get("state");
  if (!redirectUri || !isValidExtensionRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid redirect_uri" }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ error: "missing state" }, { status: 400 });
  }
  // Bind the state so ext-finish can verify this flow originated here (CSRF).
  await redis.set(`extoauthstate:${state}`, "1", { ex: 600 });
  return NextResponse.json({ url: getExtensionAuthorizeUrl(state, redirectUri) });
}

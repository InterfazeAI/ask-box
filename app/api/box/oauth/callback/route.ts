import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getBoxUserId } from "@/lib/box";
import { setBoxTokens } from "@/lib/redis";
import { getSid, SESSION_TTL_SECONDS } from "@/lib/session";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const sid = await getSid(req);
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 400 });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  // Validate the state we bound to this session in oauth/start.
  const expected = await redis.get<string>(`oauthstate:${sid}`);
  if (!state || !expected || state !== expected) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  await redis.del(`oauthstate:${sid}`);

  const tokens = await exchangeCodeForTokens(code);
  const boxUserId = await getBoxUserId(tokens.accessToken);
  await setBoxTokens(boxUserId, tokens);
  // Map this browser to its Box account. Losing the cookie only forces a
  // re-auth click — the same boxUserId (and all its data) is restored.
  await redis.set(`session:${sid}`, boxUserId, { ex: SESSION_TTL_SECONDS });

  return NextResponse.redirect(new URL("/", process.env.APP_URL!));
}

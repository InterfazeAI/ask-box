import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getBoxUserId } from "@/lib/box";
import { setBoxTokens, redis } from "@/lib/redis";
import { signSid, SESSION_TTL_SECONDS } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { code, state } = (await req.json()) as { code?: string; state?: string };
  if (!code || !state) {
    return NextResponse.json({ error: "missing code or state" }, { status: 400 });
  }

  // Verify + consume the state bound in ext-start.
  const bound = await redis.get<string>(`extoauthstate:${state}`);
  if (!bound) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  await redis.del(`extoauthstate:${state}`);

  const tokens = await exchangeCodeForTokens(code);
  const boxUserId = await getBoxUserId(tokens.accessToken);
  await setBoxTokens(boxUserId, tokens);

  // Mint a standalone session for the extension (no cookie involved). We store
  // the bare (unsigned) sid so resolveBoxUserId's `session:<sid>` lookup — which
  // uses the bare value returned by verifySid — resolves correctly.
  const sid = await signSid(crypto.randomUUID());
  const bareSid = sid.slice(0, sid.lastIndexOf("."));
  await redis.set(`session:${bareSid}`, boxUserId, { ex: SESSION_TTL_SECONDS });

  return NextResponse.json({ sid });
}

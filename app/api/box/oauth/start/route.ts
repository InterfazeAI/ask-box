import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/box";
import { getSid } from "@/lib/session";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const sid = await getSid(req);
  if (!sid) return NextResponse.json({ error: "no session" }, { status: 400 });
  const state = crypto.randomUUID();
  // Bind the OAuth state to this browser session (CSRF protection).
  await redis.set(`oauthstate:${sid}`, state, { ex: 600 });
  return NextResponse.redirect(getAuthorizeUrl(state));
}

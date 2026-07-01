import { NextRequest, NextResponse } from "next/server";
import { clearBoxTokens, redis } from "@/lib/redis";
import { resolveBoxUserId, getSid } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const sid = await getSid(req);
  if (boxUserId) await clearBoxTokens(boxUserId);
  if (sid) await redis.del(`session:${sid}`);
  return NextResponse.json({ connected: false });
}

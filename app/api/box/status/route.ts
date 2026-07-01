import { NextRequest, NextResponse } from "next/server";
import { getBoxTokens } from "@/lib/redis";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const connected = !!boxUserId && !!(await getBoxTokens(boxUserId));
  return NextResponse.json({ connected });
}

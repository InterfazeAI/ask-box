import { NextRequest, NextResponse } from "next/server";
import { getAllFileStatuses } from "@/lib/redis";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) {
    return NextResponse.json({ error: "not connected" }, { status: 401 });
  }
  const files = await getAllFileStatuses(boxUserId);
  return NextResponse.json({ files });
}

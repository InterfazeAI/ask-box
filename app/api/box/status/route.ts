import { NextResponse } from "next/server";
import { getBoxTokens } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await getBoxTokens();
  const connected = !!tokens || !!process.env.BOX_DEVELOPER_TOKEN;
  return NextResponse.json({ connected });
}

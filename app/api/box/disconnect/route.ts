import { NextRequest, NextResponse } from "next/server";
import { clearBoxTokens, getAllFileStatuses, removeFileStatus, redis } from "@/lib/redis";
import { deleteAllChunks } from "@/lib/vector";
import { resolveBoxUserId, getSid } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  const sid = await getSid(req);
  if (boxUserId) {
    // Full purge, as promised in the privacy policy: tokens, the indexed
    // document content (vectors), and every file status record.
    await clearBoxTokens(boxUserId);
    await deleteAllChunks(boxUserId);
    const statuses = await getAllFileStatuses(boxUserId);
    await Promise.all(statuses.map((s) => removeFileStatus(boxUserId, s.fileId)));
  }
  if (sid) await redis.del(`session:${sid}`);
  return NextResponse.json({ connected: false });
}

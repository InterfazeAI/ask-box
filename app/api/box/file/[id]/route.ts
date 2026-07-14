import { NextRequest, NextResponse } from "next/server";
import { BoxAuthError, deleteBoxFile } from "@/lib/box";
import { removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Delete a file from Box (moves to trash) and remove it from our index —
 * both its Redis status and its vectors — so the dashboard reflects it at once.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing file id" }, { status: 400 });

  try {
    await deleteBoxFile(boxUserId, id);
    await deleteFileChunks(boxUserId, id);
    await removeFileStatus(boxUserId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BoxAuthError) {
      return NextResponse.json({ error: "box_disconnected" }, { status: 401 });
    }
    console.error(`[file] delete failed for ${id}`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 502 },
    );
  }
}

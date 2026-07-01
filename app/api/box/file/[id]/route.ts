import { NextRequest, NextResponse } from "next/server";
import { deleteBoxFile } from "@/lib/box";
import { removeFileStatus } from "@/lib/redis";
import { deleteFileChunks } from "@/lib/vector";

export const dynamic = "force-dynamic";

/**
 * Delete a file from Box (moves to trash) and remove it from our index —
 * both its Redis status and its vectors — so the dashboard reflects it at once.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing file id" }, { status: 400 });
  }

  try {
    await deleteBoxFile(id);
    await deleteFileChunks(id);
    await removeFileStatus(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[file] delete failed for ${id}`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete failed" },
      { status: 502 },
    );
  }
}

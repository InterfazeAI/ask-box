import { NextRequest, NextResponse } from "next/server";
import { BoxAuthError, uploadFileToBox } from "@/lib/box";
import { setFileStatus } from "@/lib/redis";
import { enqueueProcess } from "@/lib/queue";
import { resolveBoxUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Upload one or more files into a Box folder from the dashboard. After each
 * upload we immediately mark the file queued and enqueue processing, so the UI
 * reacts instantly (the tree poll would otherwise pick it up within ~15s).
 */
export async function POST(req: NextRequest) {
  const boxUserId = await resolveBoxUserId(req);
  if (!boxUserId) return NextResponse.json({ error: "not connected" }, { status: 401 });

  const form = await req.formData();
  const parentId = (form.get("parentId") as string) || "0";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "no files provided" }, { status: 400 });
  }

  const uploaded: { id: string; name: string }[] = [];
  try {
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const created = await uploadFileToBox(boxUserId, parentId, file.name, bytes);
      uploaded.push(created);
      await setFileStatus(boxUserId, {
        fileId: created.id,
        name: created.name,
        stage: "queued",
        updatedAt: Date.now(),
      });
      await enqueueProcess(boxUserId, created.id);
    }
  } catch (err) {
    if (err instanceof BoxAuthError) {
      return NextResponse.json({ error: "box_disconnected", uploaded }, { status: 401 });
    }
    console.error("[upload] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed", uploaded },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, uploaded });
}

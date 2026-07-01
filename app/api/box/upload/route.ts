import { NextRequest, NextResponse } from "next/server";
import { uploadFileToBox } from "@/lib/box";
import { setFileStatus } from "@/lib/redis";
import { enqueueProcess } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Upload one or more files into a Box folder from the dashboard. After each
 * upload we immediately mark the file queued and enqueue processing, so the UI
 * reacts instantly (the tree poll would otherwise pick it up within ~15s).
 */
export async function POST(req: NextRequest) {
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
      const created = await uploadFileToBox(parentId, file.name, bytes);
      uploaded.push(created);
      await setFileStatus({
        fileId: created.id,
        name: created.name,
        stage: "queued",
        updatedAt: Date.now(),
      });
      await enqueueProcess(created.id);
    }
  } catch (err) {
    console.error("[upload] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed", uploaded },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, uploaded });
}

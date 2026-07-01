import { NextRequest, NextResponse } from "next/server";
import { createBoxFolder } from "@/lib/box";

export const dynamic = "force-dynamic";

/** Create a new Box folder from the dashboard. Body: { name, parentId? }. */
export async function POST(req: NextRequest) {
  let name: string;
  let parentId: string;
  try {
    const body = (await req.json()) as { name?: string; parentId?: string };
    name = (body.name ?? "").trim();
    parentId = body.parentId || "0";
    if (!name) throw new Error("missing name");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const folder = await createBoxFolder(parentId, name);
    return NextResponse.json({ ok: true, folder });
  } catch (err) {
    console.error("[folder] create failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "create failed" },
      { status: 502 },
    );
  }
}

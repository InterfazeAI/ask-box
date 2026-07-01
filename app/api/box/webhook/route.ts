import { NextResponse } from "next/server";

// Webhooks are not used in the per-account model (an incoming webhook can't be
// attributed to a session/account). Sync is poll-driven via /api/box/tree.
// Kept as a 200 no-op so Box doesn't see delivery failures.
export async function POST() {
  return NextResponse.json({ ok: true });
}

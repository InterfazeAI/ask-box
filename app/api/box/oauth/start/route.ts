import { NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/box";

export async function GET() {
  const state = crypto.randomUUID();
  return NextResponse.redirect(getAuthorizeUrl(state));
}

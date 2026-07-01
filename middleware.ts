import { NextRequest, NextResponse } from "next/server";
import { signSid, verifySid } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const existing = req.cookies.get("sid")?.value;
  if (await verifySid(existing)) return NextResponse.next();

  const signed = await signSid(crypto.randomUUID());
  // Forward the new cookie to THIS request's handlers, and set it on the
  // response so the browser persists it for subsequent requests.
  req.cookies.set("sid", signed);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set("sid", signed, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 31536000,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

// Run on pages + API, skip Next internals and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};

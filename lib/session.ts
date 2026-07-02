import type { NextRequest } from "next/server";
import { redis } from "@/lib/redis";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, sliding

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return toHex(sig);
}

// Constant-time-ish compare to avoid leaking signature bytes via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSid(sid: string): Promise<string> {
  return `${sid}.${await hmacHex(sid)}`;
}

export async function verifySid(
  signed: string | undefined,
): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const sid = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = await hmacHex(sid);
  return safeEqual(sig, expected) ? sid : null;
}

export async function getSid(req: NextRequest): Promise<string | null> {
  // The extension can't rely on the SameSite=Lax cookie cross-site, so it sends
  // the signed sid as a header instead. Verify that first, then fall back to
  // the cookie for the web app.
  const header = req.headers.get("x-askbox-sid");
  if (header) {
    const fromHeader = await verifySid(header);
    if (fromHeader) return fromHeader;
  }
  return verifySid(req.cookies.get("sid")?.value);
}

export async function resolveBoxUserId(
  req: NextRequest,
): Promise<string | null> {
  const sid = await getSid(req);
  if (!sid) return null;
  const boxUserId = await redis.get<string>(`session:${sid}`);
  if (boxUserId) await redis.expire(`session:${sid}`, SESSION_TTL_SECONDS);
  return boxUserId;
}

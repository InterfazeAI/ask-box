import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { isValidWebhookSignature } from "@/lib/box";

function sign(body: string, key: string, ts: string) {
  return crypto.createHmac("sha256", key).update(body + ts).digest("base64");
}

describe("isValidWebhookSignature", () => {
  const body = '{"trigger":"FILE.UPLOADED"}';
  const ts = "2026-07-01T00:00:00-00:00";

  it("accepts a valid primary signature", () => {
    process.env.BOX_WEBHOOK_PRIMARY_KEY = "primkey";
    process.env.BOX_WEBHOOK_SECONDARY_KEY = "seckey";
    const headers = {
      "box-signature-primary": sign(body, "primkey", ts),
      "box-signature-secondary": "x",
      "box-signature-version": "1",
      "box-signature-algorithm": "HmacSHA256",
      "box-delivery-timestamp": ts,
    };
    expect(isValidWebhookSignature(body, headers)).toBe(true);
  });

  it("rejects a bad signature", () => {
    const headers = {
      "box-signature-primary": "nope",
      "box-signature-secondary": "nope",
      "box-delivery-timestamp": ts,
    };
    expect(isValidWebhookSignature(body, headers)).toBe(false);
  });
});

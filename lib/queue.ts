import { Client, Receiver } from "@upstash/qstash";

// QStash is region-scoped: the default endpoint may route to the wrong region
// ("user not found in this region"). Pin it to the account's region via QSTASH_URL
// (e.g. https://qstash-us-east-1.upstash.io); fall back to the SDK default if unset.
const client = new Client({
  token: process.env.QSTASH_TOKEN!,
  ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
});
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function enqueueProcess(fileId: string): Promise<void> {
  await client.publishJSON({
    url: `${process.env.APP_URL}/api/process`,
    body: { fileId },
  });
}

export async function verifyQstash(signature: string | null, body: string): Promise<boolean> {
  if (!signature) return false;
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}

import { Client, Receiver } from "@upstash/qstash";

const client = new Client({ token: process.env.QSTASH_TOKEN! });
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

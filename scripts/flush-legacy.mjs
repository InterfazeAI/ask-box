// One-time cleanup of the pre-isolation GLOBAL data that leaked across users.
// Run ONCE during migration, before new per-account data exists:
//   node scripts/flush-legacy.mjs
// Requires the same env as the app (UPSTASH_* / vector env).
import { Redis } from "@upstash/redis";
import { Index } from "@upstash/vector";

const redis = Redis.fromEnv();
const index = Index.fromEnv();

async function main() {
  // Legacy global Redis keys.
  let removed = 0;
  removed += await redis.del("box:tokens", "box:webhook", "files");

  // Legacy per-file status keys: `file:<id>` ONLY. The new per-account format is
  // `file:<user>:<id>` (three colon-separated segments), so we keep only the
  // legacy 2-segment keys — this makes a mis-timed re-run safe: it can never
  // delete live per-account status keys.
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: "file:*", count: 200 });
    cursor = next;
    const legacy = keys.filter((k) => k.split(":").length === 2);
    if (legacy.length) {
      await redis.del(...legacy);
      removed += legacy.length;
    }
  } while (cursor !== "0");

  // Legacy global vector data lives in the default namespace.
  await index.reset();

  console.log(`Flushed legacy globals. Removed ${removed} keys + default vector namespace.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

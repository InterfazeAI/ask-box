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
  await redis.del("box:tokens", "box:webhook", "files");

  // Legacy per-file status keys: `file:<id>` (new format is `file:<user>:<id>`).
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, { match: "file:*", count: 200 });
    cursor = next;
    if (keys.length) {
      await redis.del(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");

  // Legacy global vector data lives in the default namespace.
  await index.reset();

  console.log(`Flushed legacy globals. Removed ${removed} file:* keys + default vector namespace.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * In-process rate limiter (evenly-spaced token slots). Guarantees no more than
 * `ratePerSec` operations START per second by reserving the next free slot for
 * each caller and waiting until it's due. Callers that would exceed the rate
 * wait (throttle) rather than fail — order-preserving and burst-free.
 *
 * Scope note: enforced per server process. Locally (single Node process) this
 * is a global cap; on multi-instance serverless it applies per instance.
 */
export class RateLimiter {
  private nextSlot = 0;
  private readonly intervalMs: number;

  constructor(ratePerSec: number) {
    this.intervalMs = 1000 / ratePerSec;
  }

  /** Wait until this caller's slot is due (<= ratePerSec starts per second). */
  async acquire(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  /** Run `fn` once a slot is available. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }
}

// Max outbound requests/second per provider (default 30).
const MAX_RPS = Number(process.env.PROVIDER_MAX_RPS ?? 30);

export const interfazeLimiter = new RateLimiter(MAX_RPS);
export const jigsawstackLimiter = new RateLimiter(MAX_RPS);

// server-only: do not import in client components
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Singleton instance for Upstash Ratelimit.
 * Lazy-initialized to allow missing env in tests / local dev without throwing at import time.
 */
let _ratelimiter: Ratelimit | null = null;

/**
 * Returns the singleton Ratelimit instance or null if Redis env is not configured.
 *
 * Uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from `process.env`.
 * Configured with sliding window 10 requests / 60s, analytics enabled, and
 * prefix `ratelimit:analyze-resume`.
 *
 * @returns Ratelimit instance or null when env is missing / init fails
 */
export function getRatelimiter(): Ratelimit | null {
  if (_ratelimiter) return _ratelimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // TODO: Upstash Redis env not configured — fail-open (public access without rate limiting in this env)
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    _ratelimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      analytics: true,
      prefix: "ratelimit:analyze-resume",
    });
    return _ratelimiter;
  } catch {
    // TODO: Failed to create Ratelimit instance — fail-open
    // Do not throw; allow request to proceed. Use console.warn only if guarded.
    return null;
  }
}

/**
 * Extracts client IP from request headers.
 *
 * Priority: `x-forwarded-for` (first entry) -> `x-real-ip` -> fallback `127.0.0.1`.
 *
 * @param req - Incoming Request
 * @returns Client IP string
 */
export function getClientIp(req: Request): string {
  try {
    const headers = (req as unknown as { headers?: Headers }).headers;
    if (!headers || typeof headers.get !== "function") return "127.0.0.1";
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = headers.get("x-real-ip");
    if (realIp) {
      const trimmed = realIp.trim();
      if (trimmed) return trimmed;
    }
    return "127.0.0.1";
  } catch {
    // TODO: header parsing failed — fail-open with fallback IP
    return "127.0.0.1";
  }
}

/**
 * Checks rate limit for the incoming request.
 *
 * Wraps `Ratelimit.limit(ip)` and fails open on missing env or Redis errors.
 *
 * @param req - Incoming Request
 * @returns Object with `success`, `limit`, `remaining`, `reset`
 */
export async function checkRateLimit(req: Request): Promise<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}> {
  const ip = getClientIp(req);
  const limiter = getRatelimiter();

  if (!limiter) {
    // Redis not configured — fail-open to keep public access available
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  try {
    const result = await limiter.limit(ip);
    // Fire-and-forget pending analytics (Node runtime); ignore errors silently
    await result.pending?.catch(() => {});
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch {
    // Redis / Ratelimit error — fail-open (silent; no console per project rule)
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

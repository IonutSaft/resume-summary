/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use hoisted mocks so they are available in vi.mock factories
const { mockLimit, mockRedisCtor, mockRatelimitCtor, mockSlidingWindow } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockRedisCtor: vi.fn(),
  mockRatelimitCtor: vi.fn(),
  mockSlidingWindow: vi.fn(() => "sliding-window-10-60s"),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    constructor(opts: unknown) {
      mockRedisCtor(opts);
    }
  },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow = mockSlidingWindow;
    limit = mockLimit;
    constructor(opts: unknown) {
      mockRatelimitCtor(opts);
      // ensure limit is the mocked fn
      this.limit = mockLimit;
    }
  },
}));

describe("lib/rate-limit", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default env for success cases
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    mockSlidingWindow.mockReturnValue("sliding-window-10-60s" as unknown as never);
    // Ensure modules re-evaluated fresh for singleton tests where needed
    // Do not reset modules by default; individual tests that need isolation call vi.resetModules()
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    vi.clearAllMocks();
  });

  describe("getClientIp", () => {
    it("should extract first IP from x-forwarded-for", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("should trim spaces and return first entry from x-forwarded-for", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "  203.0.113.1  , 198.51.100.2" },
      });
      expect(getClientIp(req)).toBe("203.0.113.1");
    });

    it("should fallback to x-real-ip when x-forwarded-for missing", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-real-ip": "5.6.7.8" },
      });
      expect(getClientIp(req)).toBe("5.6.7.8");
    });

    it("should prefer x-forwarded-for over x-real-ip", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
          "x-real-ip": "9.9.9.9",
        },
      });
      expect(getClientIp(req)).toBe("1.1.1.1");
    });

    it('should fallback to "127.0.0.1" when no headers present', async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });

    it('should fallback to "127.0.0.1" when headers are empty strings', async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "", "x-real-ip": "" },
      });
      const ip = getClientIp(req);
      // empty string is falsy -> fallback
      expect(ip).toBe("127.0.0.1");
    });

    it("should correctly parse IPv6 x-forwarded-for with comma-separated entries", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "::1, fe80::1" },
      });
      expect(getClientIp(req)).toBe("::1");
    });

    it("should return single IP when x-forwarded-for has no comma", async () => {
      const { getClientIp } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "203.0.113.5" },
      });
      expect(getClientIp(req)).toBe("203.0.113.5");
    });
  });

  describe("getRatelimiter", () => {
    it("should create Redis and Ratelimit with correct config (slidingWindow 10 / 60s, analytics, prefix)", async () => {
      vi.resetModules();
      // Re-apply mocks after resetModules - need to re-mock? vi.mock is hoisted so persists
      // But we need to re-import after setting env
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      const mod = await import("./rate-limit");
      const limiter = mod.getRatelimiter();
      expect(limiter).not.toBeNull();
      expect(mockRedisCtor).toHaveBeenCalledWith({
        url: "https://example.upstash.io",
        token: "test-token",
      });
      expect(mockSlidingWindow).toHaveBeenCalledWith(10, "60 s");
      expect(mockRatelimitCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.anything(),
          limiter: "sliding-window-10-60s",
          analytics: true,
          prefix: "ratelimit:analyze-resume",
        }),
      );
    });

    it("should return singleton on subsequent calls", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      const mod = await import("./rate-limit");
      const a = mod.getRatelimiter();
      const b = mod.getRatelimiter();
      expect(a).toBe(b);
      expect(mockRatelimitCtor).toHaveBeenCalledTimes(1);
    });
  });

  describe("checkRateLimit", () => {
    it("should return success true when not limited", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 9,
        reset: 1710000000000,
      });
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      const result = await checkRateLimit(req);
      expect(result).toEqual({
        success: true,
        limit: 10,
        remaining: 9,
        reset: 1710000000000,
      });
      expect(mockLimit).toHaveBeenCalledWith("1.2.3.4");
    });

    it("should return success false when limited (headers should propagate)", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockResolvedValueOnce({
        success: false,
        limit: 10,
        remaining: 0,
        reset: 1710000000000 + 60000,
      });
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      });
      const result = await checkRateLimit(req);
      expect(result.success).toBe(false);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(0);
      expect(result.reset).toBe(1710000000000 + 60000);
      expect(mockLimit).toHaveBeenCalledWith("9.9.9.9");
    });

    it("should use x-real-ip when x-forwarded-for absent", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 5,
        reset: 12345,
      });
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-real-ip": "5.6.7.8" },
      });
      await checkRateLimit(req);
      expect(mockLimit).toHaveBeenCalledWith("5.6.7.8");
    });

    it("should use fallback 127.0.0.1 when no IP headers", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockResolvedValueOnce({
        success: true,
        limit: 10,
        remaining: 5,
        reset: 12345,
      });
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost");
      await checkRateLimit(req);
      expect(mockLimit).toHaveBeenCalledWith("127.0.0.1");
    });

    it("should fail-open with {success:true, ...0} when env is missing", async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      const result = await checkRateLimit(req);
      expect(result).toEqual({
        success: true,
        limit: 0,
        remaining: 0,
        reset: 0,
      });
      expect(mockLimit).not.toHaveBeenCalled();
    });

    it("should fail-open when Redis throws (limit rejects)", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockRejectedValueOnce(new Error("Redis down"));
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      const result = await checkRateLimit(req);
      expect(result).toEqual({
        success: true,
        limit: 0,
        remaining: 0,
        reset: 0,
      });
    });

    it("should not throw and should not call console.log on Redis error", async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
      mockLimit.mockRejectedValueOnce(new Error("boom"));
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost");
      await expect(checkRateLimit(req)).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("should not throw when getRatelimiter returns null (missing env)", async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { checkRateLimit } = await import("./rate-limit");
      const req = new Request("http://localhost");
      await expect(checkRateLimit(req)).resolves.toBeDefined();
    });
  });
});

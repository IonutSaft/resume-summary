/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCheckRateLimit, mockExtractText, mockAnalyzeResume } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockExtractText: vi.fn(),
  mockAnalyzeResume: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return {
    ...actual,
    checkRateLimit: mockCheckRateLimit,
    getClientIp: actual.getClientIp,
    getRatelimiter: actual.getRatelimiter,
  };
});

vi.mock("@/lib/text-extraction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/text-extraction")>("@/lib/text-extraction");
  return {
    ...actual,
    extractText: mockExtractText,
  };
});

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    analyzeResume: mockAnalyzeResume,
  };
});

import { POST } from "./route";

function makeFile(content = "valid content here with sufficient length", name = "resume.pdf", type = "application/pdf"): File {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    const text = content.startsWith("%PDF-") ? content : `%PDF-1.4\n${content}`;
    return new File([text], name, { type });
  }
  if (lowerName.endsWith(".docx")) {
    const encoded = new TextEncoder().encode(content);
    const magic = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const combined = new Uint8Array(magic.length + encoded.length);
    combined.set(magic, 0);
    combined.set(encoded, magic.length);
    return new File([combined], name, { type });
  }
  return new File([content], name, { type });
}

async function makeRequest(file?: File | null): Promise<Request> {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return {
    formData: async () => formData,
    headers: new Headers({ "x-forwarded-for": "1.2.3.4" }),
    // minimal Request shape; route will use checkRateLimit before formData
  } as unknown as Request;
}

const VALID_ANALYSIS = {
  summary: "Experienced software engineer with 5+ years building scalable web applications using React, Node.js and cloud infrastructure. Led cross-functional teams and shipped impactful features.",
  jobTitles: ["Software Engineer", "Frontend Developer"],
  improvements: [
    { priority: "high" as const, text: "Add quantifiable achievements to each role, e.g., improved performance by 30% with load-time metrics and user impact." },
    { priority: "medium" as const, text: "Include relevant keywords from target job descriptions to pass ATS filters and improve discoverability effectively." },
    { priority: "low" as const, text: "Add links to portfolio and GitHub to showcase real-world projects and demonstrate open-source contributions consistently." },
  ],
};

describe("POST /api/analyze-resume rate limiting integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: allow
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
    });
  });

  it("should return 429 with Retry-After + X-RateLimit headers when rate limited", async () => {
    const resetMs = Date.now() + 60000;
    const resetSec = Math.ceil(resetMs / 1000);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: resetMs,
    });

    const file = makeFile("valid content sufficient length for test", "resume.pdf", "application/pdf");
    const req = await makeRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/Too many requests/i);

    // Headers
    const retryAfter = res.headers.get("Retry-After");
    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");
    const resetHeader = res.headers.get("X-RateLimit-Reset");

    expect(retryAfter).toBeDefined();
    expect(retryAfter).not.toBeNull();
    // Retry-After should be numeric string (seconds)
    expect(Number(retryAfter)).not.toBeNaN();
    expect(limit).toBe("10");
    expect(remaining).toBe("0");
    // X-RateLimit-Reset should be in seconds (Unix timestamp), not milliseconds
    expect(resetHeader).toBeDefined();
    expect(resetHeader).not.toBeNull();
    expect(Number(resetHeader)).not.toBeNaN();
    expect(Number(resetHeader)).toBe(resetSec);
  });

  it("should not call extractText or analyzeResume when rate limited (fail fast before formData)", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const file = makeFile();
    const req = await makeRequest(file);
    await POST(req);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockExtractText).not.toHaveBeenCalled();
    expect(mockAnalyzeResume).not.toHaveBeenCalled();
  });

  it("should check rate limit FIRST before parsing formData - even with no file, 429 takes precedence", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    // Empty request with no file - would normally be 400, but rate limit should win
    const req = await makeRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalled();
  });

  it("should proceed to normal flow when not rate limited (200)", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
    });
    mockExtractText.mockResolvedValue("John Doe Senior Engineer with 5 years experience in React, Node.js, TypeScript and cloud infrastructure.");
    mockAnalyzeResume.mockResolvedValue(VALID_ANALYSIS);

    const file = makeFile("John Doe Senior Engineer with 5 years experience in React, Node.js, TypeScript and cloud infrastructure.", "resume.pdf", "application/pdf");
    const req = await makeRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockExtractText).toHaveBeenCalled();
    expect(mockAnalyzeResume).toHaveBeenCalled();
  });

  it("should have 429 body matching spec exactly", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const file = makeFile();
    const req = await makeRequest(file);
    const res = await POST(req);
    const json = await res.json();
    expect(json).toEqual({ error: "Too many requests. Please try again later." });
  });

  it("should preserve runtime nodejs and maxDuration 60 after integration", async () => {
    const mod = await import("./route");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.maxDuration).toBe(60);
  });

  it("should return Retry-After 1 when reset is in the past (Math.max fallback)", async () => {
    const pastReset = Date.now() - 10_000; // 10s ago
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: pastReset,
    });
    const file = makeFile();
    const req = await makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");
    expect(mockExtractText).not.toHaveBeenCalled();
    expect(mockAnalyzeResume).not.toHaveBeenCalled();
  });

  it('should return Retry-After "60" and X-RateLimit-Reset "0" when reset is 0', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 0,
    });
    const file = makeFile();
    const req = await makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("0");
  });

  it("should set X-RateLimit-Reset in seconds (ceil(ms/1000)), not milliseconds", async () => {
    // Use a value where ms vs seconds is obviously different
    const resetMs = 1_710_000_001_234; // trailing ms portion
    const expectedSeconds = Math.ceil(resetMs / 1000).toString(); // "1710000002"
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: resetMs,
    });
    const file = makeFile();
    const req = await makeRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(429);
    const resetHeader = res.headers.get("X-RateLimit-Reset");
    expect(resetHeader).toBe(expectedSeconds);
    expect(resetHeader).not.toBe(String(resetMs));
    // Additional guard: resetHeader numeric should be ~1000x smaller than ms
    expect(Number(resetHeader)).toBeLessThan(resetMs);
    expect(Number(resetHeader)).toBe(Math.ceil(resetMs / 1000));
  });
});

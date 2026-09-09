import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAnalysisPrompt,
  analyzeResume,
  GeminiApiError,
  GeminiParseError,
} from "./gemini";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_RESUME_TEXT =
  "John Doe\nSoftware Engineer with 5 years experience in React, Node.js, TypeScript. Built scalable web apps at Example Corp. Led team of 4 engineers. Improved performance by 30%.";

const VALID_ANALYSIS = {
  summary:
    "Experienced software engineer with 5+ years building scalable web applications using React, Node.js and cloud infrastructure. Proven track record leading teams and optimizing performance.",
  jobTitles: [
    "Software Engineer",
    "Frontend Developer",
    "Full Stack Engineer",
    "React Developer",
    "Node.js Developer",
    "Web Developer",
  ],
  improvements: [
    {
      priority: "high" as const,
      text: "Add quantifiable achievements to each role, e.g., improved performance by 30% with measurable impact.",
    },
    {
      priority: "medium" as const,
      text: "Include relevant keywords from target job descriptions to pass ATS filters and improve visibility.",
    },
    {
      priority: "low" as const,
      text: "Add links to portfolio and GitHub to showcase real projects and contributions effectively.",
    },
    {
      priority: "high" as const,
      text: "Quantify leadership experience by mentioning team size, project scope, and delivery timelines clearly.",
    },
    {
      priority: "medium" as const,
      text: "Standardize date formats and ensure consistent formatting throughout the resume for readability.",
    },
  ],
};

function mockGenerateContentResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response;
}

function mockErrorResponse(status: number, message = "error") {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// buildAnalysisPrompt
// ---------------------------------------------------------------------------

describe("buildAnalysisPrompt", () => {
  it("should contain the resume snippet", () => {
    const prompt = buildAnalysisPrompt(VALID_RESUME_TEXT);
    expect(prompt).toContain("John Doe");
    expect(prompt).toContain("Software Engineer");
  });

  it("should contain JSON instruction and required fields", () => {
    const prompt = buildAnalysisPrompt(VALID_RESUME_TEXT);
    expect(prompt.toLowerCase()).toContain("json");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("jobTitles");
    expect(prompt).toContain("improvements");
  });

  it("should instruct 3-5 sentence summary, 5-8 job titles, 5-8 improvements with priorities", () => {
    const prompt = buildAnalysisPrompt(VALID_RESUME_TEXT);
    // 3-5 sentences
    expect(prompt).toMatch(/3-5 sentence summary/i);
    // 5-8 job titles
    expect(prompt).toMatch(/5-8.*job titles/i);
    // 5-8 improvements
    expect(prompt).toMatch(/5-8.*improvements/i);
    // priorities high|medium|low
    expect(prompt).toContain("high");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("low");
    expect(prompt).toContain("priority");
  });

  it("should instruct strict JSON only and no markdown", () => {
    const prompt = buildAnalysisPrompt(VALID_RESUME_TEXT);
    expect(prompt.toLowerCase()).toContain("strict json");
    expect(prompt.toLowerCase()).toMatch(/no markdown|do not.*markdown/);
  });

  it("should include exactly 1 mini few-shot example for format guidance", () => {
    const prompt = buildAnalysisPrompt(VALID_RESUME_TEXT);
    // Expect example JSON containing summary/jobTitles/improvements
    expect(prompt).toMatch(/example/i);
    // The example should contain the three keys close together
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"jobTitles"');
    expect(prompt).toContain('"improvements"');
  });

  it("should truncate long input to <=15000 chars (resume portion)", () => {
    const longText = "a".repeat(20000);
    const prompt = buildAnalysisPrompt(longText);
    expect(prompt).not.toContain("a".repeat(15001));
    // Should contain truncated version
    expect(prompt).toContain("a".repeat(15000).slice(0, 100));
    // Ensure the slice is exactly 15000 for the resume portion
    // Extract resume part - we know prompt built from truncated text
    const longText2 = "b".repeat(20000);
    const prompt2 = buildAnalysisPrompt(longText2);
    // Count consecutive b's - should be 15000 max
    const bSequence = prompt2.match(/b{100,}/g);
    expect(bSequence).not.toBeNull();
    const maxRun = Math.max(...(bSequence as string[]).map((s) => s.length));
    expect(maxRun).toBeLessThanOrEqual(15000);
    expect(prompt2).not.toContain("b".repeat(15001));
  });

  it("should not truncate short input", () => {
    const short = "short resume text";
    const prompt = buildAnalysisPrompt(short);
    expect(prompt).toContain(short);
  });

  it("should be pure function without side effects", () => {
    const a = buildAnalysisPrompt(VALID_RESUME_TEXT);
    const b = buildAnalysisPrompt(VALID_RESUME_TEXT);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// analyzeResume
// ---------------------------------------------------------------------------

describe("analyzeResume", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.GEMINI_API_KEY = "test-env-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalEnv === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalEnv;
  });

  it("should throw Error('Resume text is empty') for empty string", async () => {
    await expect(analyzeResume("")).rejects.toThrow("Resume text is empty");
  });

  it("should throw Error('Resume text is empty') for whitespace only", async () => {
    await expect(analyzeResume("   \n\t  ")).rejects.toThrow(
      "Resume text is empty",
    );
  });

  it("should throw GeminiApiError when apiKey is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(analyzeResume(VALID_RESUME_TEXT, {})).rejects.toThrow(
      GeminiApiError,
    );
    await expect(analyzeResume(VALID_RESUME_TEXT, {})).rejects.toThrow(
      /missing.*api key/i,
    );
  });

  it("should succeed: mocked generateContent returns valid JSON with fences -> parsed + validated", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fenced = "```json\n" + jsonStr + "\n```";
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(fenced));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
    });

    expect(result).toEqual(VALID_ANALYSIS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("should send correct endpoint, model and generationConfig", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);

    await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key-123",
      model: "gemini-2.0-flash",
    });

    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key-123",
    );
    const body = JSON.parse(opts.body as string);
    expect(body.contents[0].parts[0].text).toContain(VALID_RESUME_TEXT.slice(0, 50));
    expect(body.generationConfig).toEqual({
      temperature: 0.2,
      responseMimeType: "application/json",
    });
  });

  it("should use default model gemini-2.0-flash when not specified", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);

    await analyzeResume(VALID_RESUME_TEXT, { apiKey: "k" });
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-2.0-flash");
  });

  it("should strip ```json fences", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fencedVariants = [
      "```json\n" + jsonStr + "\n```",
      "```\n" + jsonStr + "\n```",
      "```JSON\n" + jsonStr + "\n```",
      "  ```json\n" + jsonStr + "\n```  ",
    ];
    for (const fenced of fencedVariants) {
      const fetchMock = vi.fn(async () => mockGenerateContentResponse(fenced));
      vi.stubGlobal("fetch", fetchMock);
      const result = await analyzeResume(VALID_RESUME_TEXT, {
        apiKey: "test-key",
      });
      expect(result).toEqual(VALID_ANALYSIS);
    }
  });

  it("should handle stringified JSON (double-encoded)", async () => {
    const doubleEncoded = JSON.stringify(JSON.stringify(VALID_ANALYSIS));
    const fenced = "```json\n" + doubleEncoded + "\n```";
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(fenced));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
    });
    expect(result).toEqual(VALID_ANALYSIS);
  });

  it("should handle plain JSON without fences", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
    });
    expect(result).toEqual(VALID_ANALYSIS);
  });

  it("should throw GeminiParseError on invalid JSON", async () => {
    const fetchMock = vi.fn(async () =>
      mockGenerateContentResponse("not json at all {{{"),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiParseError);
  });

  it("should throw GeminiParseError on schema mismatch (missing jobTitles)", async () => {
    const invalid = {
      summary:
        "Experienced engineer with solid background and achievements in software.",
      improvements: [
        {
          priority: "high",
          text: "Add quantifiable achievements with sufficient length for validation.",
        },
      ],
      // jobTitles missing
    };
    const fetchMock = vi.fn(async () =>
      mockGenerateContentResponse(JSON.stringify(invalid)),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiParseError);
  });

  it("should throw GeminiParseError on malformed candidates structure", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiParseError);
  });

  it("should retry 3x on 500 then succeed", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockErrorResponse(500))
      .mockResolvedValueOnce(mockErrorResponse(502))
      .mockResolvedValueOnce(mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
    });
    expect(result).toEqual(VALID_ANALYSIS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should retry 3x on network error then succeed", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
    });
    expect(result).toEqual(VALID_ANALYSIS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should retry on 5xx and throw last error after 3 attempts", async () => {
    const fetchMock = vi.fn(async () => mockErrorResponse(500, "server error"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should NOT retry on 400 (client error)", async () => {
    const fetchMock = vi.fn(async () => mockErrorResponse(400, "bad request"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    try {
      await analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" });
    } catch (e) {
      expect((e as GeminiApiError).status).toBe(400);
    }
  });

  it("should NOT retry on 401 and include status", async () => {
    const fetchMock = vi.fn(async () => mockErrorResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "bad-key" }),
    ).rejects.toThrow(GeminiApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry on validation error (GeminiParseError)", async () => {
    const invalid = { summary: "short", jobTitles: [], improvements: [] };
    const fetchMock = vi.fn(async () =>
      mockGenerateContentResponse(JSON.stringify(invalid)),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      analyzeResume(VALID_RESUME_TEXT, { apiKey: "test-key" }),
    ).rejects.toThrow(GeminiParseError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should timeout via AbortController and throw after retries", async () => {
    const fetchMock = vi.fn(
      (_url: string, opts?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (opts?.signal?.aborted) {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
            return;
          }
          opts?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      analyzeResume(VALID_RESUME_TEXT, {
        apiKey: "test-key",
        timeoutMs: 15,
      }),
    ).rejects.toThrow(GeminiApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("should pass AbortSignal to fetch with timeoutMs", async () => {
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal as AbortSignal | undefined;
      return mockGenerateContentResponse(jsonStr);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await analyzeResume(VALID_RESUME_TEXT, {
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("GeminiApiError and GeminiParseError extend Error with correct name", () => {
    const apiErr = new GeminiApiError("api fail", 500);
    expect(apiErr).toBeInstanceOf(Error);
    expect(apiErr.name).toBe("GeminiApiError");
    expect(apiErr.status).toBe(500);
    expect(apiErr.message).toBe("api fail");

    const parseErr = new GeminiParseError("parse fail");
    expect(parseErr).toBeInstanceOf(Error);
    expect(parseErr.name).toBe("GeminiParseError");
    expect(parseErr.message).toBe("parse fail");
  });

  it("should prefer opts.apiKey over env var", async () => {
    process.env.GEMINI_API_KEY = "env-key";
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);
    await analyzeResume(VALID_RESUME_TEXT, { apiKey: "override-key" });
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("key=override-key");
    expect(url).not.toContain("env-key");
  });

  it("should use env var when opts.apiKey not provided", async () => {
    process.env.GEMINI_API_KEY = "env-only-key";
    const jsonStr = JSON.stringify(VALID_ANALYSIS);
    const fetchMock = vi.fn(async () => mockGenerateContentResponse(jsonStr));
    vi.stubGlobal("fetch", fetchMock);
    await analyzeResume(VALID_RESUME_TEXT);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("key=env-only-key");
  });
});

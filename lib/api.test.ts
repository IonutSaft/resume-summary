import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyzeResumeError, analyzeResume } from "@/lib/api";

function makeFile(name = "resume.pdf"): File {
  return new File(["dummy content"], name, { type: "application/pdf" });
}

const validPayload = {
  summary: "Experienced software engineer with 5 years of building scalable web applications.",
  jobTitles: ["Software Engineer", "Full Stack Developer"],
  improvements: [
    { priority: "high" as const, text: "Add more quantifiable achievements to demonstrate impact and results across projects." },
    { priority: "medium" as const, text: "Include specific technologies and frameworks you have mastered in recent roles." },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AnalyzeResumeError", () => {
  it("sets name, message, status and retryAfter", () => {
    const err = new AnalyzeResumeError("oops", { status: 400, retryAfter: 30 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AnalyzeResumeError");
    expect(err.message).toBe("oops");
    expect(err.status).toBe(400);
    expect(err.retryAfter).toBe(30);
  });

  it("leaves status and retryAfter undefined when not provided", () => {
    const err = new AnalyzeResumeError("oops");
    expect(err.status).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
  });
});

describe("analyzeResume", () => {
  describe("success", () => {
    it("POSTs to /api/analyze-resume with a FormData body containing the file field and returns validated data", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const file = makeFile("resume.pdf");
      const result = await analyzeResume(file);

      expect(result).toEqual(validPayload);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/analyze-resume");
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(FormData);
      const formData = init.body as FormData;
      const appended = formData.get("file");
      expect(appended).toBeInstanceOf(File);
      expect((appended as File).name).toBe("resume.pdf");
    });

    it("forwards an AbortSignal when provided", async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(validPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await analyzeResume(makeFile(), { signal: controller.signal });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBe(controller.signal);
    });
  });

  describe("HTTP errors", () => {
    it("throws 400 with message and status from { error } body", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Bad request: invalid file" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toMatchObject({
        message: "Bad request: invalid file",
        status: 400,
      });

      try {
        await analyzeResume(makeFile());
      } catch (e) {
        expect(e).toBeInstanceOf(AnalyzeResumeError);
        expect((e as AnalyzeResumeError).status).toBe(400);
      }
    });

    it("parses Retry-After header into retryAfter on 429", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "45" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AnalyzeResumeError);
        const err = e as AnalyzeResumeError;
        expect(err.message).toBe("Too many requests");
        expect(err.status).toBe(429);
        expect(err.retryAfter).toBe(45);
      }
    });

    it("leaves retryAfter undefined when 429 has no Retry-After header", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as AnalyzeResumeError).retryAfter).toBeUndefined();
      }
    });

    it("maps 500 error with message and status", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toMatchObject({
        message: "Internal server error",
        status: 500,
      });
    });

    it("maps 502 error with message and status", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Bad gateway" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as AnalyzeResumeError;
        expect(err.message).toBe("Bad gateway");
        expect(err.status).toBe(502);
      }
    });

    it("falls back to status message when error body is not JSON", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("not-json", { status: 500 }));
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as AnalyzeResumeError;
        expect(err).toBeInstanceOf(AnalyzeResumeError);
        expect(err.status).toBe(500);
        expect(err.message).toContain("500");
      }
    });

    it("falls back to status message when error body has no error field", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "something" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as AnalyzeResumeError;
        expect(err.status).toBe(400);
        expect(err.message).toContain("400");
      }
    });
  });

  describe("network failure", () => {
    it("throws AnalyzeResumeError with the underlying message when fetch rejects", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network down"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toMatchObject({
        message: "Network down",
      });

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AnalyzeResumeError);
        expect((e as AnalyzeResumeError).status).toBeUndefined();
      }
    });

    it("uses fallback message when rejection is not an Error", async () => {
      const fetchMock = vi.fn().mockRejectedValue("string reason");
      vi.stubGlobal("fetch", fetchMock);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as Error).message).toBe("Network request failed");
      }
    });
  });

  describe("abort", () => {
    it("rejects with 'Request was cancelled' when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      // fetch will reject with AbortError, but even generic rejection should be treated as cancelled when signal aborted
      const fetchMock = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile(), { signal: controller.signal })).rejects.toMatchObject({
        message: "Request was cancelled",
      });

      try {
        await analyzeResume(makeFile(), { signal: controller.signal });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AnalyzeResumeError);
        expect((e as AnalyzeResumeError).message).toBe("Request was cancelled");
        expect((e as AnalyzeResumeError).status).toBeUndefined();
      }
    });

    it("rejects with 'Request was cancelled' when fetch rejects with AbortError", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toMatchObject({
        message: "Request was cancelled",
      });
    });

    it("rejects with 'Request was cancelled' when fetch rejects with object having name AbortError", async () => {
      const fetchMock = vi.fn().mockRejectedValue({ name: "AbortError", message: "aborted" });
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toMatchObject({
        message: "Request was cancelled",
      });
    });
  });

  describe("invalid success payload", () => {
    it("throws AnalyzeResumeError mentioning invalid response when payload is {}", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toThrow(/invalid response/i);
      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as AnalyzeResumeError;
        expect(err).toBeInstanceOf(AnalyzeResumeError);
        expect(err.status).toBe(502);
      }
    });

    it("throws when payload has wrong shapes", async () => {
      const badPayload = {
        summary: "short",
        jobTitles: [],
        improvements: [{ priority: "urgent", text: "x" }],
      };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(badPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toThrow(/invalid response/i);
    });

    it("throws when payload has wrong types", async () => {
      const badPayload = {
        summary: 123,
        jobTitles: "not an array",
        improvements: "bad",
      };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(badPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toThrow(/invalid response/i);
    });

    it("throws when summary is too short even if other fields valid", async () => {
      const badPayload = {
        summary: "too short",
        jobTitles: ["Engineer"],
        improvements: [{ priority: "high", text: "This improvement text is long enough to pass validation." }],
      };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(badPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toThrow(/invalid response/i);
    });
  });

  describe("malformed JSON on 200", () => {
    it("throws AnalyzeResumeError when response JSON is malformed", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("not json {", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(analyzeResume(makeFile())).rejects.toThrow(/invalid response/i);

      try {
        await analyzeResume(makeFile());
        expect.unreachable("should have thrown");
      } catch (e) {
        const err = e as AnalyzeResumeError;
        expect(err).toBeInstanceOf(AnalyzeResumeError);
        expect(err.status).toBe(502);
        expect(err.message).toMatch(/invalid response/i);
      }
    });
  });
});

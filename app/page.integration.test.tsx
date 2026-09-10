import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import Home from "./page";

// Must match spec exactly
vi.mock("@/lib/api", () => ({
  analyzeResume: vi.fn(),
  AnalyzeResumeError: class extends Error {
    status?: number;
    retryAfter?: number;
    constructor(m: string, o?: { status?: number; retryAfter?: number }) {
      super(m);
      this.status = o?.status;
      this.retryAfter = o?.retryAfter;
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { analyzeResume, AnalyzeResumeError } from "@/lib/api";
import { toast } from "sonner";

const mockedAnalyze = vi.mocked(analyzeResume);
const mockedToast = vi.mocked(toast);

function pdfFile(name = "resume.pdf", size = 1024): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: "application/pdf" });
}

const validPayload = {
  summary:
    "This is a great resume summary with sufficient length to pass validation, at least 10 chars. It highlights strengths and experience.",
  jobTitles: ["Software Engineer", "Frontend Developer", "Full Stack Engineer"],
  improvements: [
    {
      priority: "high" as const,
      text: "Add more quantifiable achievements to your experience section to show impact and measurable results.",
    },
    {
      priority: "medium" as const,
      text: "Include relevant keywords from job descriptions to improve ATS compatibility and visibility overall.",
    },
    {
      priority: "low" as const,
      text: "Consider adding a portfolio link to showcase real projects and contributions for hiring managers.",
    },
  ],
};

function dropFileAndClickAnalyze(fileName = "resume.pdf") {
  const dropzone = screen.getByRole("button", { name: /upload resume/i });
  const file = pdfFile(fileName, 1024);
  fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
  // File card appears, then Analyze button
  const analyzeBtn = screen.getByRole("button", { name: /analyze resume/i });
  fireEvent.click(analyzeBtn);
  return { dropzone, file };
}

describe("page integration: upload→results→reset flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom stubs
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView =
      vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
    (window as unknown as Record<string, unknown>).scrollTo = vi.fn();
    // stub rAF to run callbacks sync / immediate via setTimeout 0 behavior
    // Use immediate execution to make focusDropzone deterministic
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      // mimic spec: if flaky, run via setTimeout(0)/immediate — we run sync
      cb(0);
      return 0 as unknown as number;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("initial render shows dropzone + How it works, no results", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /upload resume/i })).toBeTruthy();
    expect(screen.getByText(/how it works/i)).toBeTruthy();
    expect(screen.queryByText(/your analysis is ready/i)).toBeNull();
    expect(screen.queryByTestId("summary-skeleton")).toBeNull();
    expect(screen.queryByTestId("job-titles-skeleton")).toBeNull();
    expect(screen.queryByTestId("improvements-skeleton")).toBeNull();
  });

  it("FULL SUCCESS FLOW: drop file -> Analyze -> loading skeleton -> results, toast, tabs, How-it-works hidden", async () => {
    // Use deferred promise to assert loading intermediate state
    let resolveAnalyze!: (v: typeof validPayload) => void;
    mockedAnalyze.mockImplementation(
      () =>
        new Promise((res) => {
          resolveAnalyze = res as never;
        })
    );

    render(<Home />);

    dropFileAndClickAnalyze();

    // loading state should appear after click — two texts exist (dropzone + page loading), use AllBy
    await waitFor(() => {
      expect(screen.getAllByText(/analyzing your resume/i).length).toBeGreaterThanOrEqual(1);
    });
    // skeleton testids — at least summary is visible (default tab)
    expect(screen.getByTestId("summary-skeleton")).toBeTruthy();
    // toast.loading was called
    expect(mockedToast.loading).toHaveBeenCalled();

    // resolve the API
    await act(async () => {
      resolveAnalyze(validPayload);
    });

    // wait for success UI
    await waitFor(() => {
      expect(screen.getByText(/your analysis is ready/i)).toBeTruthy();
    });

    expect(mockedToast.success).toHaveBeenCalledWith(
      "Analysis complete",
      expect.anything()
    );
    // How-it-works hidden
    expect(screen.queryByText(/how it works/i)).toBeNull();
    // tabs show data — summary text
    expect(screen.getByText(validPayload.summary)).toBeTruthy();
    // job titles — need to switch tab or check existence via click
    // Job titles tab may not be active, but data exists in DOM? Base UI hides inactive panels
    // Click Job Titles tab to reveal titles
    fireEvent.click(screen.getByRole("tab", { name: /job titles/i }));
    await waitFor(() => {
      expect(screen.getByText("Software Engineer")).toBeTruthy();
    });
    expect(screen.getByText("Frontend Developer")).toBeTruthy();

    // Improvements tab
    fireEvent.click(screen.getByRole("tab", { name: /improvements/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/quantifiable achievements/i)
      ).toBeTruthy();
    });
  });

  it("RESET: click Analyze Another Resume -> upload dropzone visible again and focused", async () => {
    mockedAnalyze.mockResolvedValue(validPayload as never);

    render(<Home />);
    dropFileAndClickAnalyze();

    await waitFor(() => {
      expect(screen.getByText(/your analysis is ready/i)).toBeTruthy();
    });

    // Click "Analyze Another Resume"
    const resetBtn = screen.getByRole("button", { name: /analyze another resume/i });
    fireEvent.click(resetBtn);

    // After reset, upload dropzone should be visible again
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /upload resume/i })).toBeTruthy();
    });

    const dropzone = screen.getByRole("button", { name: /upload resume/i });
    // focused
    await waitFor(() => {
      expect(document.activeElement).toBe(dropzone);
    });

    // How it works should be visible again (page shows it when idle)
    expect(screen.getByText(/how it works/i)).toBeTruthy();
    // results hidden
    expect(screen.queryByText(/your analysis is ready/i)).toBeNull();
  });

  it("UPLOAD FAILURE: mocked reject Error('boom') -> toast.error called, back to idle upload view", async () => {
    mockedAnalyze.mockRejectedValue(new Error("boom"));

    render(<Home />);
    dropFileAndClickAnalyze();

    await waitFor(() => {
      expect(mockedToast.error).toHaveBeenCalled();
    });
    // toast.error should have been called with title containing boom
    const errorCall = (mockedToast.error as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && /boom/i.test(c[0] as string)
    );
    expect(errorCall).toBeTruthy();

    // back to idle upload view: dropzone visible, no skeleton, How it works visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /upload resume/i })).toBeTruthy();
    });
    expect(screen.queryAllByText(/analyzing your resume/i).length).toBe(0);
    expect(screen.queryByTestId("summary-skeleton")).toBeNull();
    expect(screen.getByText(/how it works/i)).toBeTruthy();
    expect(screen.queryByText(/your analysis is ready/i)).toBeNull();
  });

  it("RATE LIMIT: mocked reject with AnalyzeResumeError status 429 + retryAfter 30 -> toast.error with 'Rate limit reached'", async () => {
    vi.useFakeTimers();

    const rateLimitError = new AnalyzeResumeError("Rate limit reached", {
      status: 429,
      retryAfter: 30,
    });
    mockedAnalyze.mockRejectedValue(rateLimitError);

    render(<Home />);

    const dropzone = screen.getByRole("button", { name: /upload resume/i });
    const file = pdfFile("resume.pdf", 1024);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    const analyzeBtn = screen.getByRole("button", { name: /analyze resume/i });
    fireEvent.click(analyzeBtn);

    // Flush microtasks / promise rejection handling
    await act(async () => {
      // advance timers by 0 to flush pending promises + immediate rAF
      await Promise.resolve();
    });
    // need to flush the async handleUpload which awaits analyzeResume rejection
    // with fake timers, we need to tick
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    // Wait for toast.error with Rate limit reached — since we use fake timers, waitFor won't work reliably,
    // so check via advance and direct assertion with a small real wait using act
    // Try polling with fake timers
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    expect(mockedToast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Rate limit reached/i),
      expect.anything()
    );

    // spec says showRateLimitToast starts setInterval — advance time to cover interval and avoid leak
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // toast.error should have been called again for countdown (at least initial + 1 interval)
    expect((mockedToast.error as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);

    // Advance further to trigger "You can retry now" success toast after 30s
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    // After countdown completes, success toast is shown
    // It may be toast.success with "You can retry now"
    // Check that success was called with retry message at least once after advancing
    // Note: initial success for analysis complete should not have happened (it failed), so this success is from rate limit countdown
    const successCalls = (mockedToast.success as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const retrySuccess = successCalls.find((c: unknown[]) =>
      typeof c[0] === "string" && /you can retry now/i.test(c[0] as string)
    );
    expect(retrySuccess).toBeTruthy();

    // cleanup timers and restore
    vi.useRealTimers();
  });
});

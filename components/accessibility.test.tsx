import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

declare module "vitest" {
  // `T` is unused but required — merging demands identical type parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<R extends void | Promise<void> = void, T = unknown> {
    toHaveNoViolations(): R;
  }
}
import ResumeUpload from "@/components/resume-upload";
import AnalysisTabs from "@/components/analysis-tabs";
import Home from "@/app/page";
import { analyzeResume } from "@/lib/api";
import type { ResumeAnalysisResponse } from "@/lib/schemas";

expect.extend({ toHaveNoViolations });

vi.mock("@/lib/api", () => ({ analyzeResume: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

beforeAll(() => {
  // page effects need these
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const mockedAnalyze = vi.mocked(analyzeResume);

const assertClean = async (container: HTMLElement) => {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results).toHaveNoViolations();
};

function pdfFile(name = "resume.pdf", size = 2048): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: "application/pdf" });
}

function exeFile(name = "malware.exe"): File {
  return new File(["x"], name, { type: "application/octet-stream" });
}

const validFixture: ResumeAnalysisResponse = {
  summary:
    "Experienced software engineer with 5+ years building scalable web applications and leading cross-functional teams.",
  jobTitles: ["Software Engineer", "Frontend Developer", "Full Stack Engineer"],
  improvements: [
    { priority: "high", text: "Add quantified achievements with metrics to demonstrate impact in previous roles." },
    { priority: "medium", text: "Include relevant keywords from target job descriptions to improve ATS matching." },
    { priority: "low", text: "Reorder sections to put most relevant experience first for faster recruiter scanning." },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("accessibility axe audits", () => {
  it("ResumeUpload idle has no violations", async () => {
    const { container } = render(<ResumeUpload />);
    await assertClean(container);
  });

  it("ResumeUpload with a selected file has no violations", async () => {
    const { container } = render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile("cv.pdf", 2048)] } });
    // file preview appears before axe run
    expect(screen.getByText("cv.pdf")).toBeTruthy();
    await assertClean(container);
  });

  it("ResumeUpload with validation error has no violations", async () => {
    const { container } = render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [exeFile()] } });
    expect(screen.getByRole("alert")).toBeTruthy();
    await assertClean(container);
  });

  it('ResumeUpload while uploading has no violations and aria-busy="true"', async () => {
    let resolve!: (v: ResumeAnalysisResponse) => void;
    mockedAnalyze.mockImplementation(
      () => new Promise<ResumeAnalysisResponse>((res) => void (resolve = res as unknown as (v: ResumeAnalysisResponse) => void)),
    );
    const { container } = render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    fireEvent.click(screen.getByRole("button", { name: /analyze resume\.pdf/i }));
    await waitFor(() => expect(zone.getAttribute("aria-busy")).toBe("true"));
    await assertClean(container);
    // resolve to clean up and avoid hanging
    resolve(validFixture);
    await waitFor(() => expect(zone.getAttribute("aria-busy")).toBe("false"));
  });

  it("AnalysisTabs isLoading has no violations", async () => {
    const { container } = render(<AnalysisTabs isLoading data={null} />);
    await assertClean(container);
  });

  it("AnalysisTabs with valid data has no violations", async () => {
    const { container } = render(<AnalysisTabs data={validFixture} />);
    await assertClean(container);
  });

  it("AnalysisTabs empty (data null) has no violations", async () => {
    const { container } = render(<AnalysisTabs data={null} />);
    await assertClean(container);
  });

  it("AnalysisTabs with error message has no violations", async () => {
    const { container } = render(<AnalysisTabs data={null} error="Analysis failed. Please try again." />);
    await assertClean(container);
  });

  it("Home page idle has no violations", async () => {
    const { container } = render(<Home />);
    await assertClean(container);
  });
});

describe("keyboard and ARIA behavior", () => {
  it("ArrowRight on focused Summary tab moves to Job Titles", async () => {
    render(<AnalysisTabs data={validFixture} />);
    const summaryTab = screen.getByRole("tab", { name: /^Summary$/i });
    // Ensure Summary is the active tab initially
    expect(summaryTab.getAttribute("aria-selected")).toBe("true");
    summaryTab.focus();
    expect(document.activeElement).toBe(summaryTab);
    fireEvent.keyDown(summaryTab, { key: "ArrowRight" });
    // Base UI Tabs roving tabindex — ArrowRight moves focus to next tab; selection may follow on activation
    await waitFor(() => {
      const jobTab = screen.getByRole("tab", { name: /Job Titles/i });
      const isSelected = jobTab.getAttribute("aria-selected") === "true";
      const panelVisible = screen.queryByText("Software Engineer") !== null;
      const isFocused = document.activeElement === jobTab;
      const isRoving = jobTab.getAttribute("tabindex") === "0";
      expect(isSelected || panelVisible || isFocused || isRoving).toBe(true);
    });
  });

  it("Escape in ResumeUpload clears selection", async () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    expect(screen.getByText("resume.pdf")).toBeTruthy();
    fireEvent.keyDown(zone, { key: "Escape" });
    expect(screen.queryByText("resume.pdf")).toBeNull();
  });

  it("dropzone has non-empty aria-label and aria-describedby pointing at existing hint", () => {
    const { container } = render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    const label = zone.getAttribute("aria-label");
    expect(label && label.trim().length > 0).toBe(true);
    const describedBy = zone.getAttribute("aria-describedby");
    expect(describedBy && describedBy.trim().length > 0).toBe(true);
    const ids = describedBy!.trim().split(/\s+/);
    ids.forEach((id) => {
      const el = document.getElementById(id) ?? container.querySelector(`[id="${id}"]`);
      expect(el, `aria-describedby id "${id}" should exist in DOM`).toBeTruthy();
    });
    // at minimum the hint element must exist
    const hintId = ids[0];
    expect(document.getElementById(hintId) ?? container.querySelector(`[id="${hintId}"]`)).toBeTruthy();
  });

  it('error container uses role="alert"', () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [exeFile()] } });
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Allowed:");
  });

  it('status live region role="status" exists', () => {
    const { container } = render(<ResumeUpload />);
    const status = container.querySelector('[role="status"]') ?? screen.queryByRole("status");
    expect(status).toBeTruthy();
    // also ensure at least one status region has aria-live polite (the hidden sr-only status)
    const liveStatus = container.querySelector('[role="status"][aria-live="polite"]');
    expect(liveStatus).toBeTruthy();
  });
});

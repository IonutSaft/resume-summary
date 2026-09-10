import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ResumeUpload, {
  RESUME_ACCEPT,
  formatFileSize,
  validateResumeFile,
} from "@/components/resume-upload";
import { analyzeResume } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  analyzeResume: vi.fn(),
}));

const mockedAnalyze = vi.mocked(analyzeResume);

function pdfFile(name = "resume.pdf", size = 1024): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("formatFileSize", () => {
  it("formats bytes, KB, and MB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("validateResumeFile", () => {
  it("accepts a valid pdf", () => {
    expect(validateResumeFile(pdfFile())).toBeNull();
  });

  it("rejects files over 10MB", () => {
    const big = pdfFile("big.pdf", 10 * 1024 * 1024 + 1);
    expect(validateResumeFile(big)).toBe("File must be ≤ 10MB");
  });

  it("rejects invalid extensions", () => {
    const bad = new File(["x"], "resume.exe", {
      type: "application/octet-stream",
    });
    expect(validateResumeFile(bad)).toContain("Allowed: .pdf, .docx, .txt");
  });

  it("rejects mismatched MIME/extension", () => {
    const mismatch = new File(["x"], "resume.pdf", { type: "text/plain" });
    expect(validateResumeFile(mismatch)).toContain("Allowed:");
  });
});

describe("ResumeUpload component", () => {
  it("renders an accessible dropzone and an accept-restricted input", () => {
    const { container } = render(<ResumeUpload />);
    const zone = within(container).getByRole("button", {
      name: /upload resume/i,
    });
    expect(zone.getAttribute("aria-describedby")).toBeTruthy();
    expect(RESUME_ACCEPT).toBe(".pdf,.docx,.txt");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe(".pdf,.docx,.txt");
  });

  it("shows inline error for an invalid file via drag-drop", () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    const bad = new File(["x"], "resume.exe", {
      type: "application/octet-stream",
    });
    fireEvent.drop(zone, { dataTransfer: { files: [bad] } });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Allowed: .pdf, .docx, .txt");
    expect(zone.getAttribute("aria-describedby")).toContain("-error");
  });

  it("shows file name, size, and remove; remove returns focus to dropzone", () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile("cv.pdf", 2048)] } });
    expect(screen.getByText("cv.pdf")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    const remove = screen.getByRole("button", { name: /remove cv\.pdf/i });
    fireEvent.click(remove);
    expect(screen.queryByText("cv.pdf")).toBeNull();
    expect(document.activeElement).toBe(zone);
  });

  it("Escape clears the selection", () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    expect(screen.getByText("resume.pdf")).toBeTruthy();
    fireEvent.keyDown(zone, { key: "Escape" });
    expect(screen.queryByText("resume.pdf")).toBeNull();
  });

  it("Enter opens the file picker", () => {
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("calls onUploadComplete and resets on success", async () => {
    mockedAnalyze.mockResolvedValue({
      summary: "Great candidate",
      jobTitles: ["Engineer"],
      improvements: [{ priority: "high", text: "Add more metrics here!" }],
    });
    const onComplete = vi.fn();
    render(<ResumeUpload onUploadComplete={onComplete} />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    fireEvent.click(
      screen.getByRole("button", { name: /analyze resume\.pdf/i }),
    );
    expect(screen.getByText(/analyzing your resume/i)).toBeTruthy();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText("resume.pdf")).toBeNull(),
    );
  });

  it("calls onUploadError and shows the error on failure", async () => {
    mockedAnalyze.mockRejectedValue(new Error("Server exploded"));
    const onError = vi.fn();
    render(<ResumeUpload onUploadError={onError} />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    fireEvent.click(
      screen.getByRole("button", { name: /analyze resume\.pdf/i }),
    );
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert").textContent).toContain("Server exploded");
  });

  it("disables interaction while uploading", async () => {
    let resolve!: (v: never) => void;
    mockedAnalyze.mockImplementation(
      () => new Promise((res) => void (resolve = res as never)),
    );
    render(<ResumeUpload />);
    const zone = screen.getByRole("button", { name: /upload resume/i });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile()] } });
    fireEvent.click(
      screen.getByRole("button", { name: /analyze resume\.pdf/i }),
    );
    await waitFor(() =>
      expect(zone.getAttribute("aria-busy")).toBe("true"),
    );
    expect(zone.getAttribute("aria-disabled")).toBe("true");
    resolve({
      summary: "Great candidate",
      jobTitles: ["Engineer"],
      improvements: [{ priority: "high", text: "Add more metrics here!" }],
    } as never);
    await waitFor(() =>
      expect(zone.getAttribute("aria-busy")).toBe("false"),
    );
  });
});

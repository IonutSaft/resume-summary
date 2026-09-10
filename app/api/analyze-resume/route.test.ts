/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResumeAnalysisResponseSchema, MAX_FILE_SIZE } from "@/lib/schemas";

// Hoisted mocks — preserve real error classes, mock only async functions
vi.mock("@/lib/text-extraction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/text-extraction")>(
    "@/lib/text-extraction",
  );
  return {
    ...actual,
    extractText: vi.fn(),
  };
});

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>(
    "@/lib/gemini",
  );
  return {
    ...actual,
    analyzeResume: vi.fn(),
  };
});

import { POST } from "./route";
import { extractText, EmptyTextError, UnsupportedFileTypeError } from "@/lib/text-extraction";
import { analyzeResume, GeminiApiError, GeminiParseError } from "@/lib/gemini";

const mockedExtractText = vi.mocked(extractText);
const mockedAnalyzeResume = vi.mocked(analyzeResume);

const VALID_RESUME_TEXT =
  "John Doe\nSenior Software Engineer with 5 years experience in React, Node.js, TypeScript and cloud infrastructure.\nLed team of 5, shipped features for 100k+ users.";

const VALID_ANALYSIS_RESPONSE = {
  summary:
    "Experienced software engineer with 5+ years building scalable web applications using React, Node.js and cloud infrastructure. Led cross-functional teams and shipped impactful features.",
  jobTitles: ["Software Engineer", "Frontend Developer", "Full Stack Engineer"],
  improvements: [
    {
      priority: "high" as const,
      text: "Add quantifiable achievements to each role, e.g., improved performance by 30% with load-time metrics and user impact.",
    },
    {
      priority: "medium" as const,
      text: "Include relevant keywords from target job descriptions to pass ATS filters and improve discoverability effectively.",
    },
    {
      priority: "low" as const,
      text: "Add links to portfolio and GitHub to showcase real-world projects and demonstrate open-source contributions consistently.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFile(
  content = VALID_RESUME_TEXT,
  name = "resume.pdf",
  type = "application/pdf",
): File {
  return new File([content], name, { type });
}

async function makeRequest(file?: File | null): Promise<Request> {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  // Return a duck-typed Request with formData method to avoid
  // Node vs jsdom File realm mismatch and to preserve overridden size
  return {
    formData: async () => formData,
  } as unknown as Request;
}

async function makeRequestWithField(
  fieldName: string,
  value: string | File,
): Promise<Request> {
  const formData = new FormData();
  if (value instanceof File) {
    formData.append(fieldName, value);
  } else {
    formData.append(fieldName, value);
  }
  return {
    formData: async () => formData,
  } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/analyze-resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export runtime nodejs and maxDuration 60", async () => {
    const mod = await import("./route");
    expect(mod.runtime).toBe("nodejs");
    expect(mod.maxDuration).toBe(60);
  });

  it("should return 200 and schema-valid body on success", async () => {
    mockedExtractText.mockResolvedValue(VALID_RESUME_TEXT);
    mockedAnalyzeResume.mockResolvedValue(VALID_ANALYSIS_RESPONSE);

    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(VALID_ANALYSIS_RESPONSE);
    // Must match ResumeAnalysisResponseSchema
    const parsed = ResumeAnalysisResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(mockedExtractText).toHaveBeenCalledWith(expect.any(File));
    expect(mockedAnalyzeResume).toHaveBeenCalledWith(VALID_RESUME_TEXT);
  });

  it("should return 400 when no file is uploaded (empty FormData)", async () => {
    const req = await makeRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No file uploaded/i);
  });

  it("should return 400 when file field is missing or not a File", async () => {
    // Append a string instead of File under 'file' key — get('file') will be string, not File
    const req = await makeRequestWithField("file", "not-a-file");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No file uploaded/i);
  });

  it("should return 400 when file field name is wrong", async () => {
    const file = makeFile();
    const req = await makeRequestWithField("wrongField", file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No file uploaded/i);
  });

  it("should use first file when multiple files uploaded under 'file' field (first-file-wins)", async () => {
    mockedExtractText.mockResolvedValue("FIRST FILE CONTENT");
    mockedAnalyzeResume.mockResolvedValue(VALID_ANALYSIS_RESPONSE);

    const formData = new FormData();
    formData.append("file", makeFile("FIRST FILE CONTENT", "first.pdf", "application/pdf"));
    formData.append("file", makeFile("SECOND FILE CONTENT", "second.pdf", "application/pdf"));
    const req = { formData: async () => formData } as unknown as Request;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ResumeAnalysisResponseSchema.safeParse(body).success).toBe(true);
    // extractText should have been called with the first file's content
    expect(mockedExtractText).toHaveBeenCalledTimes(1);
    const calledWithFile = mockedExtractText.mock.calls[0][0] as File;
    expect(calledWithFile.name).toBe("first.pdf");
  });

  it("should return 400 for invalid extension (.exe)", async () => {
    const file = makeFile("content", "malware.exe", "application/octet-stream");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file/i);
    // ensure extraction and analysis were NOT called
    expect(mockedExtractText).not.toHaveBeenCalled();
    expect(mockedAnalyzeResume).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid extension (.png)", async () => {
    const file = makeFile("content", "image.png", "image/png");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file/i);
  });

  it("should return 400 for MIME type mismatch (pdf name with png mime)", async () => {
    const file = makeFile("content", "resume.pdf", "image/png");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file/i);
  });

  it("should return 400 when file size exceeds 10MB", async () => {
    const file = makeFile("a", "resume.pdf", "application/pdf");
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file/i);
    expect(body.error).toMatch(/10MB|File size/i);
    expect(mockedExtractText).not.toHaveBeenCalled();
  });

  it("should return 400 when file size is exactly over limit via validation", async () => {
    const file = new File(["a"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file/i);
  });

  it("should return 400 on UnsupportedFileTypeError from extractText", async () => {
    // Need a file that passes validation first — then extraction throws
    // So mock extractText to throw UnsupportedFileTypeError regardless of file validity
    mockedExtractText.mockRejectedValue(
      new UnsupportedFileTypeError("Unsupported file type: .pdf"),
    );
    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unsupported file type/i);
    expect(mockedAnalyzeResume).not.toHaveBeenCalled();
  });

  it("should return 400 on EmptyTextError from extractText", async () => {
    mockedExtractText.mockRejectedValue(
      new EmptyTextError("Extracted text is empty or too short (minimum 10 characters required)"),
    );
    const file = makeFile("short", "resume.txt", "text/plain");
    // Ensure validation passes even for short content: FileValidationSchema checks extension/mime/size, not content length
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty|too short/i);
  });

  it("should return 502 on GeminiApiError", async () => {
    mockedExtractText.mockResolvedValue(VALID_RESUME_TEXT);
    mockedAnalyzeResume.mockRejectedValue(new GeminiApiError("Gemini API error: 500", 500));

    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/AI analysis failed/i);
  });

  it("should return 502 on GeminiParseError", async () => {
    mockedExtractText.mockResolvedValue(VALID_RESUME_TEXT);
    mockedAnalyzeResume.mockRejectedValue(new GeminiParseError("Response validation failed"));

    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/AI analysis failed/i);
  });

  it("should return 500 on unexpected error (catch-all)", async () => {
    mockedExtractText.mockResolvedValue(VALID_RESUME_TEXT);
    mockedAnalyzeResume.mockRejectedValue(new Error("Unexpected boom"));

    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Internal server error/i);
  });

  it("should return 500 when extractText throws generic error", async () => {
    mockedExtractText.mockRejectedValue(new Error("disk failure"));
    const file = makeFile(VALID_RESUME_TEXT, "resume.pdf", "application/pdf");
    const res = await POST(await makeRequest(file));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Internal server error/i);
  });

  it("should handle all allowed file types (pdf/docx/txt) successfully", async () => {
    const cases: Array<[string, string]> = [
      ["resume.pdf", "application/pdf"],
      ["resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["resume.txt", "text/plain"],
    ];

    for (const [name, mime] of cases) {
      mockedExtractText.mockResolvedValue(VALID_RESUME_TEXT);
      mockedAnalyzeResume.mockResolvedValue(VALID_ANALYSIS_RESPONSE);
      const file = makeFile(VALID_RESUME_TEXT, name, mime);
      const res = await POST(await makeRequest(file));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(ResumeAnalysisResponseSchema.safeParse(body).success).toBe(true);
      vi.clearAllMocks();
    }
  });
});

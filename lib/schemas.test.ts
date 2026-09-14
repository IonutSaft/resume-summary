import { describe, it, expect } from "vitest";
import {
  ResumeAnalysisResponseSchema,
  FileValidationSchema,
  FileMetadataSchema,
  ResumeAnalysisRequestSchema,
  validateAnalysisResponse,
} from "./schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_SUMMARY = "Experienced software engineer with 5+ years building scalable web applications using React, Node.js and cloud infrastructure.";

function makeValidResponse(overrides: Record<string, unknown> = {}) {
  return {
    summary: VALID_SUMMARY,
    jobTitles: ["Software Engineer", "Frontend Developer"],
    improvements: [
      {
        priority: "high" as const,
        text: "Add quantifiable achievements to each role, e.g., improved performance by 30%.",
      },
      {
        priority: "medium" as const,
        text: "Include relevant keywords from target job descriptions to pass ATS filters.",
      },
    ],
    ...overrides,
  };
}

const FIVE_MB = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// ResumeAnalysisResponseSchema
// ---------------------------------------------------------------------------
describe("ResumeAnalysisResponseSchema", () => {
  it("should pass for a valid response", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(makeValidResponse());
    expect(result.success).toBe(true);
  });

  it("should pass with minimal valid lengths", () => {
    const result = ResumeAnalysisResponseSchema.safeParse({
      summary: "1234567890", // exactly 10
      jobTitles: ["AB"], // exactly 2
      improvements: [{ priority: "low", text: "1234567890" }], // exactly 10
    });
    expect(result.success).toBe(true);
  });

  it("should pass with maximal lengths", () => {
    const result = ResumeAnalysisResponseSchema.safeParse({
      summary: "a".repeat(2000),
      jobTitles: Array.from({ length: 12 }, (_, i) => `Job Title ${i}AB`),
      improvements: Array.from({ length: 12 }, (_, i) => ({
        priority: "medium" as const,
        text: "b".repeat(500),
      })),
    });
    expect(result.success).toBe(true);
  });

  // summary
  it("should fail when summary is missing", () => {
    const { summary, ...rest } = makeValidResponse();
    const result = ResumeAnalysisResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should fail when summary is too short (<10)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ summary: "short" }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when summary is empty string", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ summary: "" }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when summary is too long (>2000)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ summary: "a".repeat(2001) }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when summary is not a string", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ summary: 12345 }),
    );
    expect(result.success).toBe(false);
  });

  // jobTitles
  it("should fail when jobTitles is missing", () => {
    const { jobTitles, ...rest } = makeValidResponse();
    const result = ResumeAnalysisResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitles is empty array", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ jobTitles: [] }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitles exceeds max 12", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        jobTitles: Array.from({ length: 13 }, (_, i) => `Job ${i} Title`),
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitle is empty string", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ jobTitles: [""] }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitle is too short (<2)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ jobTitles: ["A"] }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitle is too long (>100)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ jobTitles: ["a".repeat(101)] }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when jobTitle is not a string", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ jobTitles: [123] }),
    );
    expect(result.success).toBe(false);
  });

  // improvements
  it("should fail when improvements is missing", () => {
    const { improvements, ...rest } = makeValidResponse();
    const result = ResumeAnalysisResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should fail when improvements is empty array", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({ improvements: [] }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvements exceeds max 12", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: Array.from({ length: 13 }, () => ({
          priority: "high" as const,
          text: "Valid improvement text with sufficient length.",
        })),
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement priority is invalid", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ priority: "urgent", text: "Valid improvement text with sufficient length." }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement priority is missing", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ text: "Valid improvement text with sufficient length." }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement text is missing", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ priority: "high" }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement text is too short (<10)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ priority: "high", text: "short" }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement text is too long (>500)", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ priority: "high", text: "a".repeat(501) }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should fail when improvement text is empty", () => {
    const result = ResumeAnalysisResponseSchema.safeParse(
      makeValidResponse({
        improvements: [{ priority: "low", text: "" }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("should pass for each valid priority value", () => {
    for (const priority of ["high", "medium", "low"] as const) {
      const result = ResumeAnalysisResponseSchema.safeParse(
        makeValidResponse({
          improvements: [{ priority, text: "Valid improvement text with sufficient length." }],
        }),
      );
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// File validation – plain object schema (testable without DOM File)
// ---------------------------------------------------------------------------
describe("FileMetadataSchema / ResumeAnalysisRequestSchema (plain object)", () => {
  // Use whichever schema is exported as plain object; prefer FileMetadataSchema, fallback to ResumeAnalysisRequestSchema
  const PlainSchema = FileMetadataSchema ?? ResumeAnalysisRequestSchema;

  it("should be defined", () => {
    expect(PlainSchema).toBeDefined();
    expect(typeof PlainSchema.safeParse).toBe("function");
  });

  it("should pass for valid pdf metadata", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(true);
  });

  it("should pass for valid docx metadata", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.docx",
      fileSize: 5000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.success).toBe(true);
  });

  it("should pass for valid txt metadata", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.txt",
      fileSize: 2048,
      mimeType: "text/plain",
    });
    expect(result.success).toBe(true);
  });

  it("should pass for file size exactly 5MB", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: FIVE_MB,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when file size exceeds 5MB", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: FIVE_MB + 1,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail for .exe extension", () => {
    const result = PlainSchema.safeParse({
      fileName: "malware.exe",
      fileSize: 1024,
      mimeType: "application/octet-stream",
    });
    expect(result.success).toBe(false);
  });

  it("should fail for .png extension", () => {
    const result = PlainSchema.safeParse({
      fileName: "image.png",
      fileSize: 1024,
      mimeType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when mimeType does not match extension (wrong mime)", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: 1024,
      mimeType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when pdf extension has docx mime", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: 1024,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when txt extension has pdf mime", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.txt",
      fileSize: 1024,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when mimeType is invalid string", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: 1024,
      mimeType: "application/unknown",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when fileName is missing", () => {
    const result = PlainSchema.safeParse({
      fileSize: 1024,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when fileSize is missing", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail when mimeType is missing", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("ResumeAnalysisRequestSchema should also validate correctly if distinct", () => {
    // If both exist and are distinct, both should work
    if (ResumeAnalysisRequestSchema && FileMetadataSchema && ResumeAnalysisRequestSchema !== FileMetadataSchema) {
      const r1 = ResumeAnalysisRequestSchema.safeParse({
        fileName: "resume.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      });
      expect(r1.success).toBe(true);
      const r2 = ResumeAnalysisRequestSchema.safeParse({
        fileName: "virus.exe",
        fileSize: 1024,
        mimeType: "application/octet-stream",
      });
      expect(r2.success).toBe(false);
    } else {
      expect(ResumeAnalysisRequestSchema).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// FileValidationSchema – DOM File object (z.custom<File>)
// ---------------------------------------------------------------------------
describe("FileValidationSchema (File object)", () => {
  it("should be defined", () => {
    expect(FileValidationSchema).toBeDefined();
    expect(typeof FileValidationSchema.safeParse).toBe("function");
  });

  it("should pass for valid PDF File", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
      "resume.pdf",
      { type: "application/pdf" },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(true);
  });

  it("should pass for valid DOCX File", async () => {
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])],
      "resume.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(true);
  });

  it("should pass for valid TXT File", async () => {
    const file = new File(["content"], "resume.txt", { type: "text/plain" });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(true);
  });

  it("should fail when File exceeds 5MB", async () => {
    // jsdom File size is based on content; we mock by defining size via Object.defineProperty
    const file = new File(["a"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: FIVE_MB + 1 });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });

  it("should fail for .exe File", async () => {
    const file = new File(["content"], "malware.exe", { type: "application/octet-stream" });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });

  it("should fail for .png File", async () => {
    const file = new File(["content"], "image.png", { type: "image/png" });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });

  it("should fail when File mime does not match extension", async () => {
    const file = new File(["content"], "resume.pdf", { type: "image/png" });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });

  it("should fail for non-File input (plain object)", async () => {
    const result = await FileValidationSchema.safeParseAsync({
      name: "resume.pdf",
      size: 1024,
      type: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail for null/undefined", async () => {
    expect((await FileValidationSchema.safeParseAsync(null)).success).toBe(false);
    expect((await FileValidationSchema.safeParseAsync(undefined)).success).toBe(false);
  });

  it("should fail for spoofed PDF (text content with .pdf name)", async () => {
    const file = new File(["content"], "spoofed.pdf", { type: "application/pdf" });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });

  it("should fail for spoofed DOCX (text content with .docx name)", async () => {
    const file = new File(["content"], "spoofed.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
  });
});

describe("FileValidationSchema magic-byte edge cases", () => {
  it("rejects DOCX bytes with .pdf extension", async () => {
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])],
      "resume.pdf",
      { type: "application/pdf" },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /signature/i.test(issue.message))).toBe(true);
    }
  });

  it("rejects PDF bytes with .docx extension", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
      "resume.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /signature/i.test(issue.message))).toBe(true);
    }
  });

  it("rejects truncated PDF [0x25,0x50] with .pdf", async () => {
    const file = new File(
      [new Uint8Array([0x25, 0x50])],
      "resume.pdf",
      { type: "application/pdf" },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /signature/i.test(issue.message))).toBe(true);
    }
  });

  it("rejects TXT with null byte [0x48,0x69,0x00] with .txt", async () => {
    const file = new File(
      [new Uint8Array([0x48, 0x69, 0x00])],
      "resume.txt",
      { type: "text/plain" },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /signature/i.test(issue.message))).toBe(true);
    }
  });

  it("rejects TXT with invalid UTF-8 [0xFF,0xFE] with .txt", async () => {
    const file = new File(
      [new Uint8Array([0xff, 0xfe])],
      "resume.txt",
      { type: "text/plain" },
    );
    const result = await FileValidationSchema.safeParseAsync(file);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /signature/i.test(issue.message))).toBe(true);
    }
  });

  it("accepts valid TXT with unicode/emoji (\"Café 🎉\") with .txt and valid PDF %PDF-1.4 bytes", async () => {
    const txtFile = new File(["Café 🎉"], "resume.txt", { type: "text/plain" });
    const txtResult = await FileValidationSchema.safeParseAsync(txtFile);
    expect(txtResult.success).toBe(true);

    const pdfFile = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])],
      "resume.pdf",
      { type: "application/pdf" },
    );
    const pdfResult = await FileValidationSchema.safeParseAsync(pdfFile);
    expect(pdfResult.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAnalysisResponse helper
// ---------------------------------------------------------------------------
describe("validateAnalysisResponse", () => {
  it("should return success true for valid data", () => {
    const result = validateAnalysisResponse(makeValidResponse());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe(VALID_SUMMARY);
      expect(result.data.jobTitles).toHaveLength(2);
      expect(result.data.improvements).toHaveLength(2);
    }
  });

  it("should return success false for invalid data (short summary)", () => {
    const result = validateAnalysisResponse(makeValidResponse({ summary: "short" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("should return success false for missing fields", () => {
    const result = validateAnalysisResponse({});
    expect(result.success).toBe(false);
  });

  it("should return success false for null", () => {
    const result = validateAnalysisResponse(null);
    expect(result.success).toBe(false);
  });

  it("should preserve typing – success data matches ResumeAnalysisResponse", () => {
    const valid = makeValidResponse();
    const parsed = validateAnalysisResponse(valid);
    if (parsed.success) {
      // Type guard check
      const summary: string = parsed.data.summary;
      const titles: string[] = parsed.data.jobTitles;
      expect(typeof summary).toBe("string");
      expect(Array.isArray(titles)).toBe(true);
    }
  });
});

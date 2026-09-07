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

const TEN_MB = 10 * 1024 * 1024;

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

  it("should pass for file size exactly 10MB", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: TEN_MB,
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(true);
  });

  it("should fail when file size exceeds 10MB", () => {
    const result = PlainSchema.safeParse({
      fileName: "resume.pdf",
      fileSize: TEN_MB + 1,
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

  it("should pass for valid PDF File", () => {
    const file = new File(["content"], "resume.pdf", { type: "application/pdf" });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("should pass for valid DOCX File", () => {
    const file = new File(["content"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("should pass for valid TXT File", () => {
    const file = new File(["content"], "resume.txt", { type: "text/plain" });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("should fail when File exceeds 10MB", () => {
    // jsdom File size is based on content; we mock by defining size via Object.defineProperty
    const file = new File(["a"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: TEN_MB + 1 });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("should fail for .exe File", () => {
    const file = new File(["content"], "malware.exe", { type: "application/octet-stream" });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("should fail for .png File", () => {
    const file = new File(["content"], "image.png", { type: "image/png" });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("should fail when File mime does not match extension", () => {
    const file = new File(["content"], "resume.pdf", { type: "image/png" });
    const result = FileValidationSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("should fail for non-File input (plain object)", () => {
    const result = FileValidationSchema.safeParse({
      name: "resume.pdf",
      size: 1024,
      type: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("should fail for null/undefined", () => {
    expect(FileValidationSchema.safeParse(null).success).toBe(false);
    expect(FileValidationSchema.safeParse(undefined).success).toBe(false);
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

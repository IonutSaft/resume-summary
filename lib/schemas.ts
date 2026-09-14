import { z } from "zod";
import { validateFileSignature } from "@/lib/file-signatures";

/** Maximum allowed file size in bytes (5MB) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** MIME types allowed for resume uploads */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

/** Mapping from file extension to expected MIME type */
export const EXTENSION_TO_MIME = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

/** List of allowed file extensions derived from EXTENSION_TO_MIME keys */
export const ALLOWED_EXTENSIONS = Object.keys(
  EXTENSION_TO_MIME,
) as (keyof typeof EXTENSION_TO_MIME)[];

/**
 * Extracts file extension from filename (including the dot).
 * @param fileName - Name of the file
 * @returns Lowercase extension (e.g., ".pdf") or empty string if no extension
 */
function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}

/**
 * Zod schema for a single resume improvement suggestion.
 * Priority indicates urgency, text contains the actionable advice.
 */
export const ImprovementSchema = z.object({
  /** Urgency level of the improvement */
  priority: z.enum(["high", "medium", "low"]),
  /** Actionable improvement text (10-500 characters) */
  text: z.string().min(10).max(500),
});

/**
 * Zod schema for the complete resume analysis response from the AI.
 * Contains a professional summary, suggested job titles, and improvement suggestions.
 */
export const ResumeAnalysisResponseSchema = z.object({
  /** Professional summary of the resume (10-2000 characters) */
  summary: z.string().min(10).max(2000),
  /** Suggested job titles matching the resume (1-12 items, 2-100 chars each) */
  jobTitles: z.array(z.string().min(2).max(100)).min(1).max(12),
  /** List of prioritized improvement suggestions (1-12 items) */
  improvements: z.array(ImprovementSchema).min(1).max(12),
});

/** Inferred TypeScript type for the resume analysis response */
export type ResumeAnalysisResponse = z.infer<
  typeof ResumeAnalysisResponseSchema
>;

/** Inferred TypeScript type for a single improvement */
export type Improvement = z.infer<typeof ImprovementSchema>;

/**
 * Zod schema for file metadata validation (used in API requests).
 * Validates: fileName, fileSize, mimeType, extension/MIME consistency.
 */
export const FileMetadataSchema = z
  .object({
    /** Original filename with extension */
    fileName: z.string().min(1, "fileName is required"),
    /** File size in bytes */
    fileSize: z.number().int().nonnegative(),
    /** MIME type as reported by the browser */
    mimeType: z.string().min(1, "mimeType is required"),
  })
  .superRefine((data, ctx) => {
    const ext = getExtension(data.fileName);

    if (data.fileSize > MAX_FILE_SIZE) {
      ctx.addIssue({
        code: "custom",
        message: `File size must be ≤ ${MAX_FILE_SIZE} bytes (5MB)`,
        path: ["fileSize"],
      });
    }

    if (!ext || !(ALLOWED_EXTENSIONS as string[]).includes(ext)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        path: ["fileName"],
      });
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(data.mimeType)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid MIME type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        path: ["mimeType"],
      });
    }

    if (
      ext &&
      (ALLOWED_EXTENSIONS as string[]).includes(ext) &&
      (ALLOWED_MIME_TYPES as readonly string[]).includes(data.mimeType)
    ) {
      const expected = EXTENSION_TO_MIME[ext as keyof typeof EXTENSION_TO_MIME];
      if (expected && data.mimeType !== expected) {
        ctx.addIssue({
          code: "custom",
          message: `MIME type "${data.mimeType}" does not match extension "${ext}" (expected "${expected}")`,
          path: ["mimeType"],
        });
      }
    }
  });

/** Alias for FileMetadataSchema - used for resume analysis request validation */
export const ResumeAnalysisRequestSchema = FileMetadataSchema;

/** Inferred TypeScript type for file metadata */
export type FileMetadata = z.infer<typeof FileMetadataSchema>;

/** Inferred TypeScript type for resume analysis request */
export type ResumeAnalysisRequest = z.infer<typeof ResumeAnalysisRequestSchema>;

/**
 * Zod schema for validating an uploaded resume File object.
 * Performs comprehensive validation:
 * - File instance check
 * - File size limit (5MB)
 * - Allowed extension (.pdf, .docx, .txt)
 * - Allowed MIME type
 * - Extension/MIME type consistency
 * - Magic byte signature verification (async, defense-in-depth)
 */
export const FileValidationSchema = z
  .custom<File>((val) => val instanceof File, {
    message: "Expected a File object",
  })
  .superRefine(async (file, ctx) => {
    if (!(file instanceof File)) {
      return;
    }

    const ext = getExtension(file.name);

    if (file.size > MAX_FILE_SIZE) {
      ctx.addIssue({
        code: "custom",
        message: `File size must be ≤ ${MAX_FILE_SIZE} bytes (5MB)`,
        path: [],
      });
    }

    if (!ext || !(ALLOWED_EXTENSIONS as string[]).includes(ext)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
        path: [],
      });
    }

    if (
      !(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type as string)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid MIME type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        path: [],
      });
    }

    if (
      ext &&
      (ALLOWED_EXTENSIONS as string[]).includes(ext) &&
      (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type as string)
    ) {
      const expected = EXTENSION_TO_MIME[ext as keyof typeof EXTENSION_TO_MIME];
      if (expected && file.type !== expected) {
        ctx.addIssue({
          code: "custom",
          message: `MIME type "${file.type}" does not match extension "${ext}" (expected "${expected}")`,
          path: [],
        });
      }
    }

    if (ext && (ALLOWED_EXTENSIONS as string[]).includes(ext)) {
      const ok = await validateFileSignature(file, ext);
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: "File content does not match extension (invalid file signature)",
          path: [],
        });
      }
    }
  });

/**
 * Validates an AI analysis response against the ResumeAnalysisResponseSchema.
 * @param data - Unknown data to validate (typically parsed JSON from AI)
 * @returns Zod SafeParseResult with success flag and parsed data or errors
 */
export function validateAnalysisResponse(
  data: unknown,
): ReturnType<typeof ResumeAnalysisResponseSchema.safeParse> {
  return ResumeAnalysisResponseSchema.safeParse(data);
}

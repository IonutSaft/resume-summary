import { z } from "zod";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const EXTENSION_TO_MIME = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

export const ALLOWED_EXTENSIONS = Object.keys(
  EXTENSION_TO_MIME,
) as (keyof typeof EXTENSION_TO_MIME)[];

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}

export const ImprovementSchema = z.object({
  priority: z.enum(["high", "medium", "low"]),
  text: z.string().min(10).max(500),
});

export const ResumeAnalysisResponseSchema = z.object({
  summary: z.string().min(10).max(2000),
  jobTitles: z.array(z.string().min(2).max(100)).min(1).max(12),
  improvements: z.array(ImprovementSchema).min(1).max(12),
});

export type ResumeAnalysisResponse = z.infer<
  typeof ResumeAnalysisResponseSchema
>;

export type Improvement = z.infer<typeof ImprovementSchema>;

export const FileMetadataSchema = z
  .object({
    fileName: z.string().min(1, "fileName is required"),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string().min(1, "mimeType is required"),
  })
  .superRefine((data, ctx) => {
    const ext = getExtension(data.fileName);

    if (data.fileSize > MAX_FILE_SIZE) {
      ctx.addIssue({
        code: "custom",
        message: `File size must be ≤ ${MAX_FILE_SIZE} bytes (10MB)`,
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

export const ResumeAnalysisRequestSchema = FileMetadataSchema;

export type FileMetadata = z.infer<typeof FileMetadataSchema>;

export type ResumeAnalysisRequest = z.infer<typeof ResumeAnalysisRequestSchema>;

export const FileValidationSchema = z
  .custom<File>((val) => val instanceof File, {
    message: "Expected a File object",
  })
  .superRefine((file, ctx) => {
    if (!(file instanceof File)) {
      return;
    }

    const ext = getExtension(file.name);

    if (file.size > MAX_FILE_SIZE) {
      ctx.addIssue({
        code: "custom",
        message: `File size must be ≤ ${MAX_FILE_SIZE} bytes (10MB)`,
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
  });

export function validateAnalysisResponse(
  data: unknown,
): ReturnType<typeof ResumeAnalysisResponseSchema.safeParse> {
  return ResumeAnalysisResponseSchema.safeParse(data);
}

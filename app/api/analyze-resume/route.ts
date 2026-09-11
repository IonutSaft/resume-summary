// server-only (Next.js App Router API route; runs on server)
import { FileValidationSchema } from "@/lib/schemas";
import {
  extractText,
  UnsupportedFileTypeError,
  EmptyTextError,
} from "@/lib/text-extraction";
import {
  analyzeResume,
  GeminiApiError,
  GeminiParseError,
} from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Note: FileValidationSchema enforces 5MB limit (MAX_FILE_SIZE).
// Vercel's default body parser limit is 4.5MB — for files >4.5MB, configure
// `vercel.json` `functions.bodySize` or use streaming upload in production.

/**
 * Creates a standardized JSON error response.
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @returns Response with { error: message } and given status
 */
function errorJson(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Formats Zod validation issues into a concise error message.
 * @param issues - Array of Zod issue objects
 * @returns Semicolon-separated string of issue messages
 */
function validationErrorMessage(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join("; ");
}

/**
 * POST /api/analyze-resume
 *
  * Accepts multipart/form-data with a single `file` field (.pdf, .docx, .txt, ≤5MB).
 * Extracts text from the resume file and runs AI analysis to return structured
 * insights (summary, jobTitles, improvements).
 *
 * @param req - Incoming Request containing FormData with field `file: File`
 * @returns 200 with ResumeAnalysisResponse on success,
 *          400 for missing/invalid file or extraction errors,
 *          502 for AI analysis failures,
 *          500 for unexpected errors.
 */
export async function POST(req: Request): Promise<Response> {
  // Rate limiting — 10 requests / 60s sliding window per IP
  const rate = await checkRateLimit(req);
  if (!rate.success) {
    const retryAfter =
      rate.reset > 0
        ? Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000)).toString()
        : "60";
    const resetSeconds = rate.reset > 0 ? Math.ceil(rate.reset / 1000) : 0;
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter,
          "X-RateLimit-Limit": rate.limit ? String(rate.limit) : "10",
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset": String(resetSeconds),
        },
      },
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return errorJson("No file uploaded", 400);
    }

    const file = formData.get("file");

    // Multi-file note: formData.get("file") returns the first entry if multiple files
    // are uploaded under the same field name. This is intentional first-file-wins behavior.
    if (!file || !(file instanceof File)) {
      return errorJson("No file uploaded", 400);
    }

    const validation = FileValidationSchema.safeParse(file);
    if (!validation.success) {
      return errorJson(`Invalid file: ${validationErrorMessage(validation.error.issues)}`, 400);
    }

    // TODO: Add magic-byte / file signature validation for defense-in-depth
    // (extension/MIME can be spoofed; lib/text-extraction throws on unsupported type)

    let text: string;
    try {
      text = await extractText(file);
    } catch (err) {
      if (
        err instanceof UnsupportedFileTypeError ||
        err instanceof EmptyTextError
      ) {
        return errorJson(err.message, 400);
      }
      throw err;
    }

    let result: Awaited<ReturnType<typeof analyzeResume>>;
    try {
      // No hardcoded model — delegates to DEFAULT_MODEL in lib/gemini.ts
      result = await analyzeResume(text);
    } catch (err) {
      if (err instanceof GeminiApiError || err instanceof GeminiParseError) {
        return errorJson("AI analysis failed. Please try again later.", 502);
      }
      throw err;
    }

    return Response.json(result, { status: 200 });
  } catch {
    return errorJson("Internal server error", 500);
  }
}

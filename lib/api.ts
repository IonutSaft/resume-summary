import {
  ResumeAnalysisResponseSchema,
  validateAnalysisResponse,
  type ResumeAnalysisResponse,
} from "@/lib/schemas";

/**
 * Error thrown when resume analysis via the API fails.
 *
 * Carries the HTTP `status` when the failure came from a server response,
 * and `retryAfter` (seconds) when the server responded with 429 + Retry-After.
 */
export class AnalyzeResumeError extends Error {
  status?: number;
  retryAfter?: number;

  constructor(message: string, opts?: { status?: number; retryAfter?: number }) {
    super(message);
    this.name = "AnalyzeResumeError";
    this.status = opts?.status;
    this.retryAfter = opts?.retryAfter;
  }
}

interface ErrorBody {
  error?: unknown;
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object" && "error" in body) {
    const err = (body as ErrorBody).error;
    if (typeof err === "string" && err.length > 0) return err;
  }
  return fallback;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const value = Number(header.trim());
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Uploads a resume file for AI analysis.
 *
 * POSTs multipart/form-data (`file` field) to `/api/analyze-resume` and
 * returns the validated `ResumeAnalysisResponse`.
 *
 * @param file - Resume file (.pdf, .docx, .txt) to analyze.
 * @param opts - Optional `{ signal }` AbortSignal to cancel the request.
 * @returns Validated analysis result.
 * @throws {AnalyzeResumeError} On HTTP errors (with `status`, plus `retryAfter` for 429),
 *   on request cancellation ('Request was cancelled'), or on invalid success payloads.
 */
export async function analyzeResume(
  file: File,
  opts?: { signal?: AbortSignal },
): Promise<ResumeAnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/analyze-resume", {
      method: "POST",
      body: formData,
      signal: opts?.signal,
    });
  } catch (err) {
    if (opts?.signal?.aborted || isAbortError(err)) {
      throw new AnalyzeResumeError("Request was cancelled");
    }
    throw new AnalyzeResumeError(
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const message = errorMessageFromBody(
      body,
      res.statusText || `Request failed with status ${res.status}`,
    );
    const retryAfter =
      res.status === 429 ? parseRetryAfter(res.headers.get("Retry-After")) : undefined;
    throw new AnalyzeResumeError(message, { status: res.status, retryAfter });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new AnalyzeResumeError("Invalid response from server", { status: 502 });
  }

  // Defensive client-side validation (server already validates with Zod).
  const parsed =
    typeof validateAnalysisResponse === "function"
      ? validateAnalysisResponse(data)
      : ResumeAnalysisResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new AnalyzeResumeError("Invalid response from server", { status: 502 });
  }
  return parsed.data;
}

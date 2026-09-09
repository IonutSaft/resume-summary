import {
  ResumeAnalysisResponseSchema,
  type ResumeAnalysisResponse,
} from "@/lib/schemas";

export class GeminiApiError extends Error {
  status?: number;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeminiApiError";
    this.status = status;
    Object.setPrototypeOf(this, GeminiApiError.prototype);
  }
}

export class GeminiParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GeminiParseError";
    Object.setPrototypeOf(this, GeminiParseError.prototype);
  }
}

const MAX_PROMPT_CHARS = 15000;
const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_TIMEOUT_MS = 30000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_ATTEMPTS = 3;

export function buildAnalysisPrompt(resumeText: string): string {
  const truncated = resumeText.slice(0, MAX_PROMPT_CHARS);

  return `You are an expert resume analyzer. Analyze the resume below and return structured insights.

Instructions:
- Write a 3-5 sentence summary that captures the candidate's core strengths, experience level and key technologies.
- List 5-8 job titles as raw strings only (e.g. "Software Engineer"). Do not return objects for job titles.
- Provide 5-8 improvements, each as an object {priority: "high" | "medium" | "low", text: string}. Use priority to indicate importance.
- Return strict JSON only matching {"summary": string, "jobTitles": string[], "improvements": {priority: "high"|"medium"|"low", text: string}[]}. No markdown, no code fences, no explanation.
- Keep summary to 3-5 sentences, jobTitles 5-8 items, improvements 5-8 items.

Example (format guidance):
{"summary": "Results-driven software engineer with 4 years building React and Node.js applications at scale. Led a team of 5 and shipped features used by 100k+ users. Strong background in TypeScript, cloud and performance optimization.", "jobTitles": ["Software Engineer", "Frontend Developer", "Full Stack Engineer", "React Developer", "Node.js Developer"], "improvements": [{"priority": "high", "text": "Add quantifiable achievements to each role, e.g., improved performance by 30% with load-time metrics."}, {"priority": "medium", "text": "Include keywords from target job descriptions to pass ATS filters effectively."}, {"priority": "low", "text": "Add links to portfolio and GitHub to showcase real-world projects and open-source work."}]}

Resume to analyze:
${truncated}

Return ONLY valid JSON matching {"summary": string, "jobTitles": string[], "improvements": {priority: "high"|"medium"|"low", text: string}[]}. Do not include markdown, code fences, or explanation.`;
}

export async function analyzeResume(
  resumeText: string,
  opts?: { apiKey?: string; model?: string; timeoutMs?: number },
): Promise<ResumeAnalysisResponse> {
  if (!resumeText || resumeText.trim().length === 0) {
    throw new Error("Resume text is empty");
  }

  const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiApiError("Missing Gemini API key");
  }

  const model = opts?.model ?? DEFAULT_MODEL;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildAnalysisPrompt(resumeText);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = (await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      } as RequestInit)) as Response;

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        throw new GeminiApiError(`Gemini API error: ${status}`, status);
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch (e) {
        throw new GeminiParseError(
          `Failed to parse Gemini response envelope as JSON: ${(e as Error).message}`,
          { cause: e },
        );
      }

      const text = (
        raw as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] }
      )?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== "string") {
        throw new GeminiParseError(
          "Malformed Gemini response: missing candidates[0].content.parts[0].text",
        );
      }

      let stripped = text.trim();
      if (stripped.startsWith("```")) {
        stripped = stripped
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripped);
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed as string);
          } catch {}
        }
      } catch (e) {
        throw new GeminiParseError(
          `Failed to parse Gemini response as JSON: ${(e as Error).message}`,
          { cause: e },
        );
      }

      const validated = ResumeAnalysisResponseSchema.safeParse(parsed);
      if (!validated.success) {
        throw new GeminiParseError(
          `Response validation failed: ${validated.error.message}`,
          { cause: validated.error },
        );
      }

      return validated.data;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err instanceof GeminiParseError) {
        throw err;
      }

      if (
        err instanceof GeminiApiError &&
        err.status !== undefined &&
        err.status >= 400 &&
        err.status < 500
      ) {
        throw err;
      }

      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message.toLowerCase().includes("aborted"));

      const isRetryable =
        isAbort ||
        (err instanceof GeminiApiError &&
          err.status !== undefined &&
          err.status >= 500) ||
        (!(err instanceof GeminiApiError) &&
          !(err instanceof GeminiParseError));

      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

      if (!isRetryable || isLastAttempt) {
        if (isAbort && !(err instanceof GeminiApiError)) {
          throw new GeminiApiError(
            `Gemini request timed out after ${timeoutMs}ms`,
            undefined,
            { cause: err },
          );
        }
        if (!(err instanceof GeminiApiError) && err instanceof Error) {
          if (isRetryable) {
            throw new GeminiApiError(err.message, undefined, { cause: err });
          }
        }
        throw err;
      }

      const delay =
        RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new GeminiApiError("Gemini request failed after retries");
}

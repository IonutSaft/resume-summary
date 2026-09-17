# ResumeSummary — AI Resume Review

> **Live Demo →** [Open here](https://resume-summary-three.vercel.app)

Upload a resume. Get an honest, actionable review in seconds — summary, matching job titles, and prioritized improvements.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Zod, and the Google Gemini API. No accounts. No storage. Files are sent only for analysis.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture \& Project Structure](#architecture--project-structure)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Validation \& Security](#validation--security)
- [Testing](#testing)
- [Accessibility](#accessibility)

## Overview

ResumeSummary is a single-page app (`app/page.tsx`) that reviews resumes with AI:

1. User uploads a resume (PDF, DOCX, or TXT, ≤ 5 MB) via drag & drop or file browse.
2. The file is validated client-side and server-side (type, size, extension/MIME consistency, magic-byte signature).
3. Text is extracted on the server (`unpdf` for PDF, `mammoth` for DOCX, `File.text()` for TXT).
4. The text is sent to Google Gemini with a constrained, low-temperature prompt that returns strict JSON.
5. Results render in three tabs — Summary, Job Titles, Improvements — with copy-to-clipboard, priority badges, and skeleton loading states.

There is no database and no file persistence. Uploaded files exist only in memory for the duration of the request.

## Features

**AI analysis output**

- 3–5 sentence professional summary of strengths and positioning.
- 5–8 suggested job titles matched to the resume content.
- 5–8 concrete improvements, each with `text` and `priority` (`high` | `medium` | `low`), sorted high → medium → low and capped at 12.

**File handling**

- Accepted types: PDF (`.pdf`), Word (`.docx`), plain text (`.txt`).
- Max size: 5 MB (client + server enforced, Zod `FileValidationSchema`).
- Magic-byte signature verification (`lib/file-signatures.ts`) — extension/MIME spoofing is rejected.
- Minimum 10 characters of extracted text required; whitespace is normalized.
- Prompt input truncated to 15,000 characters to bound cost/latency.

**Upload UX (`components/resume-upload.tsx`)**

- Drag & drop + browse button, keyboard accessible.
- Upload progress indicator and cancel support via `AbortController`.
- Toast feedback via `sonner`, including a rate-limit countdown on 429.
- Phase-driven page state (`idle` / `uploading` / `success`) with scroll and focus management on completion.

**Results UX (`components/analysis-tabs.tsx`)**

- Three tabs: Summary, Job Titles, Improvements.
- Per-tab copy-to-clipboard buttons.
- Priority badges for improvements (high / medium / low).
- Skeleton placeholders during analysis; empty states handled gracefully.

**Platform**

- Light/dark theme via `next-themes`.
- Fully responsive layout.
- Rate limiting: 10 requests / 60 s per IP (Upstash Redis sliding window, fail-open if unconfigured).
- Resilient Gemini client: 30 s timeout, 3 attempts with 500 ms / 1000 ms backoff, robust JSON extraction.

## Tech Stack

| Layer              | Technology                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- |
| Framework          | Next.js 16.3.4 (App Router, `runtime: nodejs`, `maxDuration: 60`)                      |
| UI                 | React 19.2.8, TypeScript 5, Tailwind CSS 4                                             |
| Components         | shadcn/ui + Base UI, `lucide-react` icons                                              |
| Fonts              | `next/font` — Geist, Noto Sans, Playfair Display                                       |
| Validation         | Zod 4.5.4 (client + server schemas)                                                    |
| AI                 | Google Gemini API (`gemini-3.6-flash` default), `temperature: 0.2`, JSON response mode |
| Text extraction    | `unpdf` 1.8.1 (PDF), `mammoth` 1.12.2 (DOCX), native `File.text()` (TXT)               |
| Rate limiting      | Upstash Redis + `@upstash/ratelimit` (sliding window)                                  |
| Theming / feedback | `next-themes`, `sonner` toasts                                                         |
| Testing            | Vitest 5 + Testing Library + jsdom + axe-core                                          |

## Architecture & Project Structure

```
/
├── app/
│   ├── page.tsx                    # Main single-page UI (client component)
│   ├── layout.tsx                  # Root layout: fonts, ThemeProvider, Toaster
│   ├── globals.css                 # Tailwind + theme tokens
│   ├── page.integration.test.tsx   # Page-level integration tests
│   └── api/
│       └── analyze-resume/
│           └── route.ts            # POST /api/analyze-resume (FormData `file`)
├── components/
│   ├── resume-upload.tsx           # Dropzone, validation, analyzeResume() call
│   ├── analysis-tabs.tsx           # Results tabs, skeletons, copy buttons
│   ├── theme-provider.tsx          # next-themes wrapper
│   ├── accessibility.test.tsx      # axe-core accessibility tests
│   └── ui/                         # shadcn/ui: button, card, tabs, input,
│                                   # textarea, alert, progress, skeleton, sonner
├── lib/
│   ├── schemas.ts                  # Zod schemas, size/MIME maps, magic-byte check
│   ├── api.ts                      # Client fetch wrapper + AnalyzeResumeError
│   ├── gemini.ts                   # Prompt builder, Gemini call, JSON normalization
│   ├── text-extraction.ts          # PDF/DOCX/TXT extraction + normalization
│   ├── file-signatures.ts          # Magic-byte validation
│   ├── rate-limit.ts               # Upstash limiter, IP resolution, 429 headers
│   └── utils.ts                    # cn() class helper
├── types/
│   └── api.ts                      # Shared API type re-exports
├── vitest.config.mts               # jsdom, tsconfig paths, React plugin
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── components.json
└── postcss.config.mjs
```

**Key files**

- `app/api/analyze-resume/route.ts` — Accepts `FormData` (`file` field, first-file-wins), runs rate-limit → validation → extraction → Gemini, returns typed JSON or a structured error.
- `lib/schemas.ts` — `FileValidationSchema` (async: size, MIME, extension consistency, magic bytes), `ResumeAnalysisResponseSchema`, `ImprovementSchema`. Constants: `MAX_FILE_SIZE` (5 MB), `ALLOWED_MIME_TYPES`, `EXTENSION_TO_MIME`.
- `lib/gemini.ts` — `buildAnalysisPrompt()` (truncation + delimited injection defense), `analyzeResume()` (timeout/retry/parse/normalize/validate).
- `lib/text-extraction.ts` — `extractText()` dispatcher plus per-format extractors; throws typed `TextExtractionError` hierarchy.
- `lib/rate-limit.ts` — `getRatelimiter()`, `getClientIp()`, `checkRateLimit()`; emits `Retry-After` and `X-RateLimit-*` headers.
- `lib/api.ts` — Client-side `analyzeResume(file, { signal })`; throws `AnalyzeResumeError` with `status` and `retryAfter`.
- `components/resume-upload.tsx` / `components/analysis-tabs.tsx` — Upload and results UI.

## How It Works

1. **Upload** — `ResumeUpload` validates extension/size client-side, then POSTs `FormData` via `analyzeResume()`. Cancellation aborts the fetch.
2. **Rate limit** — Sliding window (10 req / 60 s per IP). Exceeding returns `429` with `Retry-After` and `X-RateLimit-*` headers; the UI shows a countdown toast.
3. **Validation** — `FileValidationSchema` checks size (≤ 5 MB), MIME allowlist, extension→MIME consistency, and magic-byte signature.
4. **Extraction** — Format-specific extractor runs; whitespace is collapsed; fewer than 10 characters is rejected as `400`.
5. **AI analysis** — Prompt wraps the resume in delimiters (injection defense), truncates to 15,000 chars, requests strict JSON at `temperature: 0.2`. The client applies a 30 s timeout and retries twice (500 ms, 1000 ms).
6. **Parsing** — Response JSON is recovered defensively: direct parse → code-fence strip → first-`{`…last-`}` slice → double-encoded JSON handling. Output is normalized (trim strings, dedup job titles case-insensitively, stable-sort improvements high → medium → low, slice to 12) and validated with Zod.
7. **Display** — `app/page.tsx` transitions to `success`, scrolls results into view, moves focus for screen readers, and renders `AnalysisTabs`.

## API Reference

### `POST /api/analyze-resume`

Analyzes a single resume file. `runtime: nodejs`, `maxDuration: 60`.

**Request** — `multipart/form-data` with a single `file` field (if multiple files are sent, the first wins):

```bash
curl -X POST http://localhost:3000/api/analyze-resume \
  -F "file=@resume.pdf;type=application/pdf"
```

Constraints: `application/pdf` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` / `text/plain`, `.pdf` / `.docx` / `.txt`, ≤ 5 MB.

**Success — `200 OK`**

```json
{
  "summary": "Senior frontend engineer with 6 years building React and TypeScript applications...",
  "jobTitles": [
    "Senior Frontend Engineer",
    "Full-Stack Developer",
    "UI Engineer"
  ],
  "improvements": [
    {
      "title": "Quantify impact",
      "description": "Add metrics to your two most recent roles (e.g. load time, conversion, users).",
      "priority": "high"
    },
    {
      "title": "Add a skills section",
      "description": "List core frameworks and tools so ATS parsers catch them.",
      "priority": "medium"
    }
  ]
}
```

Schema (`ResumeAnalysisResponseSchema`):

| Field          | Type                                    | Notes                                                              |
| -------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `summary`      | `string`                                | 3–5 sentences                                                      |
| `jobTitles`    | `string[5–8]`                           | Deduped (case-insensitive)                                         |
| `improvements` | `{ title, description, priority }[5–8]` | `priority`: `high` \| `medium` \| `low`; sorted high → low, max 12 |

**Errors** — all errors return `{ "error": "<message>" }`:

| Status | Meaning                                                                                             | Example                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `400`  | Invalid file (missing, too large, wrong type, signature mismatch, extraction too short, empty text) | `{ "error": "File must be PDF, DOCX, or TXT under 5MB." }`                                |
| `429`  | Rate limit exceeded (10 req / 60 s per IP)                                                          | Headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |
| `500`  | Server misconfiguration (e.g. missing `GEMINI_API_KEY`) or unexpected failure                       | `{ "error": "Server is not configured. Please try again later." }`                        |
| `502`  | Gemini request failed after retries, timed out, or returned unparseable JSON                        | `{ "error": "AI analysis failed. Please try again." }`                                    |

Client usage (`lib/api.ts`):

```ts
import { analyzeResume, AnalyzeResumeError } from "@/lib/api";

try {
  const result = await analyzeResume(file, { signal: abortController.signal });
  // result.summary, result.jobTitles, result.improvements
} catch (err) {
  if (err instanceof AnalyzeResumeError) {
    console.error(err.status, err.retryAfter, err.message);
  }
}
```

## Getting Started

**Prerequisites**

- Node.js 18+ (20 LTS recommended)
- npm (or pnpm / yarn / bun)
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/))
- Upstash Redis credentials (optional — rate limiting fails open without them)

**Install**

```bash
git clone <your-repo-url>
cd resume-summary
npm install
```

**Configure environment**

```bash
cp .env.example .env.local   # if an example exists; otherwise create .env.local manually
```

```env
# .env.local
GEMINI_API_KEY=your-gemini-api-key-here
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token-here
```

**Run**

```bash
npm run dev     # start dev server → http://localhost:3000
npm run build   # production build
npm run start   # serve production build
```

## Environment Variables

| Name                       | Required | Description                                                                                                    |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`           | Yes      | Google Gemini API key. Without it the API route returns `500`.                                                 |
| `UPSTASH_REDIS_REST_URL`   | No       | Upstash Redis REST URL for rate limiting. If unset, rate limiting is skipped (fail-open) and requests proceed. |
| `UPSTASH_REDIS_REST_TOKEN` | No       | Upstash Redis REST token. Required alongside the URL to enable rate limiting.                                  |

> Fail-open note: when Upstash credentials are absent or Redis is unreachable, `checkRateLimit()` logs a warning and allows the request rather than blocking legitimate traffic. Both Upstash vars should be configured to enforce the 10 req / 60 s per-IP limit.

## Scripts

| Command                     | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `npm run dev`               | Start the Next.js dev server                     |
| `npm run build`             | Production build                                 |
| `npm run start`             | Serve the production build                       |
| `npm run lint`              | Run ESLint                                       |
| `npm test`                  | Run Vitest (watch mode in TTY, single run in CI) |
| `npx vitest run`            | Run the full suite once                          |
| `npx vitest run --coverage` | Run with coverage report                         |

## Validation & Security

- **Zod everywhere** — `FileValidationSchema` (size, MIME, extension) on upload; `ResumeAnalysisResponseSchema` on AI output. Malformed AI JSON is rejected with `502`, never rendered blindly.
- **Extension ↔ MIME consistency** — `EXTENSION_TO_MIME` map rejects files whose extension doesn't match their declared MIME type (e.g. `resume.pdf` sent as `text/plain`).
- **Magic-byte verification** — `lib/file-signatures.ts` inspects the file header (`%PDF` for PDF, ZIP header for DOCX, text heuristics for TXT) so renamed executables/scripts are rejected.
- **Prompt-injection delimiters** — The resume text is wrapped in explicit delimiters with instructions to treat it as untrusted data, not instructions. Input is truncated to `MAX_PROMPT_CHARS` (15,000).
- **Rate limiting** — Upstash sliding window, 10 requests / 60 s per IP, with `429` + `Retry-After` semantics. Fail-open only when Redis is unconfigured/unreachable.
- **Low-temperature structured output** — `temperature: 0.2` + `responseMimeType: "application/json"` constrains the model to the expected schema.
- **No storage** — Files are parsed in memory per request and never written to disk or a database. Gemini receives resume text solely to produce the analysis.
- **Timeouts & bounds** — 30 s Gemini timeout, 3 total attempts, `maxDuration: 60` on the route, 5 MB upload cap, 12-item improvement cap.

## Testing

Vitest 5 with Testing Library, jsdom, and axe-core.

```bash
npm test                  # watch / single run
npx vitest run            # single run
npx vitest run --coverage # with coverage
npx vitest run lib/gemini.test.ts  # single file
```

**Coverage includes**

- `components/resume-upload.test.tsx` — validation, progress, cancel, error states.
- `components/analysis-tabs.test.tsx` — tab switching, copy buttons, badges, skeletons.
- `app/page.integration.test.tsx` — end-to-end upload → results flow (mocked fetch).
- `lib/*.test.ts` — schemas, Gemini prompt/parse/retry logic, text extraction, file signatures, rate limiting.
- `components/accessibility.test.tsx` — axe-core checks for keyboard, ARIA, and live-region compliance.

## Accessibility

- Keyboard-operable dropzone and tabs (focus visible, `Enter`/`Space`/`Tab` support).
- ARIA roles/labels on upload region, tabs, progress, and alerts.
- `aria-live` regions announce upload progress, errors, and completion.
- Focus is moved to results on success; page phases use semantic headings.
- Color-contrast-safe priority badges that don't rely on color alone (text labels included).
- Verified with axe-core in `components/accessibility.test.tsx`.

---

_Privacy note: files are only sent for analysis — nothing is stored. Uploaded resumes live in memory for a single request and are discarded after the response._

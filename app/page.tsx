"use client";

import * as React from "react";
import {
  CloudUpload,
  FileSearch,
  ListChecks,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import AnalysisTabs from "@/components/analysis-tabs";
import ResumeUpload from "@/components/resume-upload";
import { Button } from "@/components/ui/button";
import { AnalyzeResumeError } from "@/lib/api";
import type { ResumeAnalysisResponse } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "success";

function isRateLimitError(error: Error): error is AnalyzeResumeError {
  return (
    error instanceof AnalyzeResumeError ||
    (error as AnalyzeResumeError).status === 429 ||
    /rate limit|too many requests|retry/i.test(error.message)
  );
}

function getRetryAfter(error: Error): number | undefined {
  const maybe = error as AnalyzeResumeError;
  if (typeof maybe.retryAfter === "number") return maybe.retryAfter;
  const match = /retry in (\d+)\s*s/i.exec(error.message);
  if (match) return Number(match[1]);
  return undefined;
}

function friendlyErrorMessage(error: Error): { title: string; hint: string } {
  const raw = error.message || "Upload failed. Try again.";
  if (isRateLimitError(error)) {
    const retryAfter = getRetryAfter(error);
    return {
      title: "Rate limit reached",
      hint:
        retryAfter !== undefined && Number.isFinite(retryAfter)
          ? `You've made too many requests. Retry in ${retryAfter} seconds.`
          : "You've made too many requests. Please wait a minute and retry.",
    };
  }
  if (/\d+\s?MB|file size|too large/i.test(raw)) {
    return {
      title: raw,
      hint: "Try a smaller file under 5MB, or export your resume as TXT.",
    };
  }
  if (/allowed|invalid.*(extension|mime|type)|pdf|docx|txt/i.test(raw)) {
    return {
      title: raw,
      hint: "Only PDF, DOCX, or TXT files are supported.",
    };
  }
  if (/network|fetch|failed to fetch|offline|network request failed/i.test(raw)) {
    return {
      title: "Network error",
      hint: "Check your connection and try again.",
    };
  }
  if (/invalid response|unexpected|502/i.test(raw)) {
    return {
      title: "Unexpected server response",
      hint: "The analysis came back in an unexpected format. Try again.",
    };
  }
  if (/cancel/i.test(raw)) {
    return { title: "Upload cancelled", hint: "Select a file to try again." };
  }
  return { title: raw, hint: "Please try again with a different file." };
}

/** Rate-limit toast with a live "Retry in X seconds" countdown. */
function showRateLimitToast(retryAfter: number) {
  const total = Math.max(1, Math.min(120, Math.round(retryAfter)));
  let remaining = total;
  const id = "resume-rate-limit";

  const render = () =>
    toast.error("Rate limit reached", {
      id,
      description: `Too many requests. Retry in ${remaining} second${remaining === 1 ? "" : "s"}. Your file is safe — no need to re-select it.`,
      duration: 10000,
    });

  render();
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      toast.success("You can retry now", {
        id,
        description: "Rate limit window has passed. Upload your resume again.",
        duration: 4000,
      });
      return;
    }
    render();
  }, 1000);
}

const STEPS = [
  {
    icon: CloudUpload,
    title: "Upload",
    text: "Drop a PDF, DOCX, or TXT — up to 5MB. Files stay in your browser until analysis.",
  },
  {
    icon: FileSearch,
    title: "Analyze",
    text: "AI reads your experience and matches it to roles in a few seconds.",
  },
  {
    icon: ListChecks,
    title: "Improve",
    text: "Get a summary, job titles, and prioritized fixes you can copy in one click.",
  },
] as const;

export default function Home() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<ResumeAnalysisResponse | null>(null);
  const [uploadKey, setUploadKey] = React.useState(0);

  const uploadSectionRef = React.useRef<HTMLDivElement>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);
  const shouldFocusUploadRef = React.useRef(false);
  const savedScrollRef = React.useRef(0);
  const phaseRef = React.useRef<Phase>("idle");
  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const isUploading = phase === "uploading";
  const showResults = phase === "success" && result !== null;

  const focusDropzone = React.useCallback(() => {
    // Wait a frame so the remounted upload is in the DOM.
    requestAnimationFrame(() => {
      const el = uploadSectionRef.current?.querySelector<HTMLElement>(
        '[role="button"][aria-label*="Upload resume"]',
      );
      // preventScroll keeps the restored scroll position stable.
      el?.focus({ preventScroll: true });
    });
  }, []);

  const handleUploadStart = React.useCallback(() => {
    phaseRef.current = "uploading";
    setPhase("uploading");
    toast.dismiss("resume-rate-limit");
    toast.loading("Analyzing your resume…", {
      id: "resume-analysis",
      description: "This usually takes a few seconds. Hold tight.",
    });
  }, []);

  const handleUploadComplete = React.useCallback(
    (data: ResumeAnalysisResponse) => {
      phaseRef.current = "success";
      setResult(data);
      setPhase("success");
      toast.success("Analysis complete", {
        id: "resume-analysis",
        description: "Your summary, matched roles, and fixes are ready below.",
        duration: 4000,
      });
    },
    [],
  );

  const handleUploadError = React.useCallback((error: Error) => {
    // Validation errors fire before uploading starts — keep the form visible
    // and surface a short toast. Upload failures reset to the upload step.
    if (phaseRef.current !== "uploading") {
      const { title, hint } = friendlyErrorMessage(error);
      toast.error(title, {
        description: hint,
        duration: 6000,
      });
      return;
    }
    phaseRef.current = "idle";
    setPhase("idle");
    setResult(null);
    if (isRateLimitError(error)) {
      const retryAfter = getRetryAfter(error) ?? 60;
      toast.dismiss("resume-analysis");
      showRateLimitToast(retryAfter);
    } else {
      const { title, hint } = friendlyErrorMessage(error);
      toast.error(title, {
        id: "resume-analysis",
        description: hint,
        duration: 8000,
      });
    }
  }, []);

  const handleReset = React.useCallback(() => {
    // Capture scroll so we can restore context and avoid a jump to page top.
    savedScrollRef.current = window.scrollY;
    shouldFocusUploadRef.current = true;
    phaseRef.current = "idle";
    toast.dismiss("resume-analysis");
    toast.dismiss("resume-rate-limit");
    setResult(null);
    setPhase("idle");
    setUploadKey((k) => k + 1);
  }, []);

  // On success: scroll to the top of the results once they've committed.
  React.useEffect(() => {
    if (phase !== "success") return;
    const t = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [phase]);

  // After reset: restore scroll context to the upload card and move focus
  // to the drop zone for immediate keyboard interaction.
  React.useEffect(() => {
    if (phase !== "idle" || !shouldFocusUploadRef.current) return;
    shouldFocusUploadRef.current = false;
    const y = savedScrollRef.current;
    // Keep the remount from yanking scroll; settle on the upload card.
    requestAnimationFrame(() => {
      if (uploadSectionRef.current) {
        const top =
          uploadSectionRef.current.getBoundingClientRect().top +
          window.scrollY -
          96;
        // Clamp to the saved position so large result pages don't jump to top.
        window.scrollTo({
          top: Math.min(Math.max(top, 0), Math.max(y, top)),
          behavior: "smooth",
        });
      }
      focusDropzone();
    });
  }, [phase, uploadKey, focusDropzone]);

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip bg-background font-sans text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:h-[3.75rem] sm:px-6 lg:px-8">
          <a
            href="#main"
            className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm dark:border-white/10 dark:bg-card"
            >
              <Sparkles className="size-4" />
            </span>
            <span className="font-heading text-[17px] font-semibold tracking-tight sm:text-[18px]">
              ResumeSummary
            </span>
          </a>
          <p className="hidden items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground sm:inline-flex">
            <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">Private by design · PDF · DOCX · TXT</span>
          </p>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-16 pt-7 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12"
      >
        {/* Hero */}
        <section
          aria-labelledby="page-title"
          className="text-center sm:text-left"
        >
          <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground shadow-sm dark:border-white/10 dark:bg-card/80">
            <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-foreground" />
            AI resume review
          </p>
          <h1
            id="page-title"
            className="mx-auto mt-4 max-w-[20ch] font-heading text-[clamp(1.75rem,6vw,2.25rem)] font-semibold leading-[1.08] tracking-tight text-balance sm:mx-0 sm:text-[2rem] md:text-[2.5rem] lg:text-[2.75rem]"
          >
            Turn your resume into a sharper job search
          </h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-[14px] leading-7 text-pretty text-muted-foreground sm:mx-0 sm:text-[15px] sm:leading-7">
            Upload your resume for an instant summary, matched job titles, and
            prioritized improvements — ready to copy into applications.
          </p>
        </section>

        {/* Upload / loading / results — fixed min-height avoids layout shift */}
        <section
          aria-label={showResults ? "Analysis results" : "Resume upload"}
          className="mt-6 min-h-[440px] sm:mt-8 sm:min-h-[460px] lg:min-h-[480px]"
        >
          {/* Upload card (kept mounted during upload so the request isn't aborted;
              visually hidden while loading / results are shown) */}
          <div
            ref={uploadSectionRef}
            className={cn("scroll-mt-24", (isUploading || showResults) && "hidden")}
            aria-hidden={isUploading || showResults}
          >
            <ResumeUpload
              key={uploadKey}
              onUploadStart={handleUploadStart}
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
            />
          </div>

          {/* Loading state: same tabs shell with skeletons = no layout shift */}
          {isUploading ? (
            <div
              ref={resultsRef}
              className="scroll-mt-24 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 motion-safe:animate-spin motion-reduce:animate-none"
                />
                <p className="leading-none">
                  Analyzing your resume…
                  <span className="sr-only"> Loading analysis results.</span>
                </p>
              </div>
              <AnalysisTabs isLoading data={null} />
            </div>
          ) : null}

          {/* Results */}
          {showResults && result ? (
            <div
              ref={resultsRef}
              className="scroll-mt-24 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none"
            >
              <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-heading text-[17px] font-semibold tracking-tight sm:text-lg">
                      Your analysis is ready
                    </h2>
                    <p className="text-xs leading-5 text-muted-foreground sm:text-[13px]">
                      Review each tab, copy what you need.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  className="min-h-11 w-full shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                >
                  <Plus aria-hidden="true" className="size-4 shrink-0" />
                  New Analysis
                </Button>
              </div>

              <AnalysisTabs data={result} />

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-center text-xs leading-6 text-pretty text-muted-foreground sm:max-w-[32ch] sm:text-left lg:max-w-none">
                  Want to compare versions? Upload a revised resume to see how
                  your score changes.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReset}
                  className="min-h-11 w-full shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                >
                  Analyze Another Resume
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {/* How it works — only on the upload step to keep results focused */}
        {!isUploading && !showResults ? (
          <section aria-label="How it works" className="mt-10 sm:mt-12">
            <h2 className="font-heading text-[15px] font-semibold tracking-tight sm:text-base">
              How it works
            </h2>
            <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3 lg:gap-4">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex flex-col rounded-xl border border-border/70 bg-card px-4 py-4 shadow-sm transition-colors hover:border-border hover:shadow-sm dark:border-white/10 dark:bg-card sm:px-4 sm:py-5"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground dark:border-white/10 dark:bg-muted/20"
                  >
                    <step.icon className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold tracking-tight">
                    <span
                      aria-hidden="true"
                      className="mr-1.5 text-muted-foreground/70 tabular-nums"
                    >
                      {i + 1}.
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-6 text-pretty text-muted-foreground">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-4 py-5 text-xs leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-pretty">
            ResumeSummary · AI feedback for job seekers. Files are only sent for
            analysis — nothing is stored.
          </p>
          <p className="shrink-0 tabular-nums">PDF · DOCX · TXT · 5MB max</p>
        </div>
      </footer>
    </div>
  );
}

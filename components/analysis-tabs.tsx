"use client";

import * as React from "react";
import {
  AlertCircle,
  Briefcase,
  Check,
  Copy,
  FileText,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Improvement, ResumeAnalysisResponse } from "@/lib/schemas";

export type Priority = Improvement["priority"];
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AnalysisTabValue = "summary" | "job-titles" | "improvements";

export interface AnalysisTabsProps {
  /** Validated analysis result. `null` renders empty states. */
  data?: ResumeAnalysisResponse | null;
  /** When true, skeleton loaders replace tab content. */
  isLoading?: boolean;
  /** API / validation error message. Shows an error banner + per-tab fallback. */
  error?: string | null;
  /** Controlled tab value. */
  value?: AnalysisTabValue;
  /** Default tab for uncontrolled usage. */
  defaultValue?: AnalysisTabValue;
  /** Tab change callback. */
  onValueChange?: (value: AnalysisTabValue) => void;
  /** Additional classes for the root. */
  className?: string;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20 dark:text-red-300",
  medium:
    "border-amber-500/25 bg-amber-500/[0.08] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  low: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
};

function sortImprovements(items: Improvement[]): Improvement[] {
  return [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard API unavailable");
  } catch {
    // Fallback for insecure contexts / older browsers / tests.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

function useCopiedFlag(timeout = 2000): [boolean, () => void] {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flag = React.useCallback(() => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), timeout);
  }, [timeout]);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return [copied, flag];
}

function CopyButton({
  label,
  onCopy,
  disabled,
}: {
  label: string;
  onCopy: () => void;
  disabled?: boolean;
}) {
  const [copied, flagCopied] = useCopiedFlag();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => {
        onCopy();
        flagCopied();
      }}
      aria-label={label}
      aria-live="polite"
      className={cn(
        "min-h-9 shrink-0 rounded-md border transition-colors motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "sm:min-h-9",
        copied &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/40",
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Button>
  );
}

function SummarySkeleton() {
  return (
    <div
      className="flex min-h-[96px] flex-col gap-2.5"
      aria-hidden="true"
      data-testid="summary-skeleton"
    >
      <Skeleton className="h-4 w-full rounded motion-reduce:animate-none" />
      <Skeleton className="h-4 w-full rounded motion-reduce:animate-none" />
      <Skeleton className="h-4 w-11/12 rounded motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 rounded motion-reduce:animate-none" />
      <span className="sr-only">Loading summary…</span>
    </div>
  );
}

function JobTitlesSkeleton() {
  return (
    <div
      className="flex min-h-[84px] flex-wrap gap-2"
      aria-hidden="true"
      data-testid="job-titles-skeleton"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-7 rounded-full motion-reduce:animate-none"
          style={{ width: `${72 + ((i * 37) % 64)}px` }}
        />
      ))}
      <span className="sr-only">Loading job titles…</span>
    </div>
  );
}

function ImprovementsSkeleton() {
  return (
    <ul
      className="flex min-h-[340px] flex-col gap-2.5"
      aria-hidden="true"
      data-testid="improvements-skeleton"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 dark:border-white/10"
        >
          <Skeleton className="mt-0.5 h-5 w-16 shrink-0 rounded-full motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-full rounded motion-reduce:animate-none" />
            <Skeleton
              className="h-4 rounded motion-reduce:animate-none"
              style={{ width: `${55 + ((i * 23) % 35)}%` }}
            />
          </div>
        </li>
      ))}
      <span className="sr-only">Loading improvements…</span>
    </ul>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div
      role="status"
      className="flex min-h-[140px] flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:px-6 sm:py-12"
    >
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        {icon}
      </span>
      <p className="text-sm font-semibold tracking-tight text-balance">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return (
    <span
      data-testid={`priority-badge-${priority}`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-widest uppercase shadow-sm",
        PRIORITY_STYLES[priority],
      )}
    >
      {label}
    </span>
  );
}

function formatImprovements(items: Improvement[]): string {
  return sortImprovements(items)
    .map(
      (item) =>
        `• [${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}] ${item.text}`,
    )
    .join("\n");
}

/**
 * Tabbed display for resume analysis results.
 *
 * Base UI `Tabs` handles roving tabindex + Arrow/Home/End keyboard
 * navigation and `aria-selected` on triggers natively; panels fade in
 * on mount via `animate-in fade-in`.
 */
export default function AnalysisTabs({
  data,
  isLoading = false,
  error = null,
  value,
  defaultValue = "summary",
  onValueChange,
  className,
}: AnalysisTabsProps) {
  const summary = data?.summary?.trim() ?? "";
  const jobTitles = React.useMemo(
    () => (data?.jobTitles ?? []).map((t) => t.trim()).filter(Boolean),
    [data],
  );
  const improvements = React.useMemo(
    () => sortImprovements(data?.improvements ?? []),
    [data],
  );

  const handleCopySummary = React.useCallback(async () => {
    if (!summary) return;
    const ok = await copyToClipboard(summary);
    if (ok) toast.success("Copied!");
    else toast.error("Copy failed. Select the text manually.");
  }, [summary]);

  const handleCopyJobTitles = React.useCallback(async () => {
    if (jobTitles.length === 0) return;
    const ok = await copyToClipboard(jobTitles.join(", "));
    if (ok) toast.success("Copied!");
    else toast.error("Copy failed. Select the text manually.");
  }, [jobTitles]);

  const handleCopyImprovements = React.useCallback(async () => {
    if (improvements.length === 0) return;
    const ok = await copyToClipboard(formatImprovements(improvements));
    if (ok) toast.success("Copied!");
    else toast.error("Copy failed. Select the text manually.");
  }, [improvements]);

  const tabProps =
    value !== undefined
      ? { value, onValueChange: onValueChange as (v: string) => void }
      : { defaultValue, onValueChange: onValueChange as (v: string) => void };

  return (
    <div className={cn("w-full", className)}>
      {/* Polite live region for loading announcement */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {isLoading ? "Loading analysis results" : ""}
      </div>

      {error && !isLoading ? (
        <Alert variant="destructive" className="mb-4 rounded-lg">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Analysis incomplete</AlertTitle>
          <AlertDescription className="text-pretty">{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs orientation="horizontal" {...tabProps}>
        <TabsList
          aria-label="Analysis results"
          className="grid w-full grid-cols-3 gap-1 rounded-lg p-1 sm:inline-flex sm:w-auto"
        >
          <TabsTrigger
            value="summary"
            className="min-h-11 rounded-md px-2 text-[11px] leading-none tracking-wider data-active:shadow-sm motion-reduce:transition-none sm:min-h-9 sm:px-3 sm:text-xs"
          >
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="job-titles"
            className="min-h-11 rounded-md px-1 text-[11px] leading-none tracking-wider data-active:shadow-sm motion-reduce:transition-none sm:min-h-9 sm:px-3 sm:text-xs"
          >
            <span className="truncate">Job Titles</span>
            {!isLoading && jobTitles.length > 0 ? (
              <span
                aria-label={`${jobTitles.length} suggested titles`}
                className="ml-1 inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground tabular-nums shadow-sm dark:border-white/10 dark:bg-card"
              >
                {jobTitles.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="improvements"
            className="min-h-11 rounded-md px-1 text-[11px] leading-none tracking-wider data-active:shadow-sm motion-reduce:transition-none sm:min-h-9 sm:px-3 sm:text-xs"
          >
            <span className="truncate">Improvements</span>
            {!isLoading && improvements.length > 0 ? (
              <span
                aria-label={`${improvements.length} suggestions`}
                className="ml-1 inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground tabular-nums shadow-sm dark:border-white/10 dark:bg-card"
              >
                {improvements.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Summary */}
        <TabsContent
          value="summary"
          className="animate-in fade-in mt-3 duration-200 motion-reduce:animate-none sm:mt-4"
        >
          <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm dark:border-white/10">
            <CardHeader className="gap-1.5 pb-3">
              <CardTitle className="text-balance">Professional summary</CardTitle>
              <CardDescription className="text-pretty">
                AI-generated overview of your resume strengths.
              </CardDescription>
              {!isLoading && summary ? (
                <CardAction className="self-start">
                  <CopyButton
                    label="Copy summary to clipboard"
                    onCopy={handleCopySummary}
                  />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent
              className="min-h-[120px] pt-0"
              aria-busy={isLoading}
              aria-live="polite"
            >
              {isLoading ? (
                <SummarySkeleton />
              ) : error && !summary ? (
                <EmptyState
                  icon={<AlertCircle className="size-5" />}
                  title="Summary unavailable"
                  description="We couldn't generate a summary for this file. Try uploading again."
                />
              ) : summary ? (
                <p className="max-w-prose text-sm leading-7 text-pretty text-foreground/90 dark:text-foreground/85">
                  {summary}
                </p>
              ) : (
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title="No summary available"
                  description="Upload a resume to generate a professional summary."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Job titles */}
        <TabsContent
          value="job-titles"
          className="animate-in fade-in mt-3 duration-200 motion-reduce:animate-none sm:mt-4"
        >
          <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm dark:border-white/10">
            <CardHeader className="gap-1.5 pb-3">
              <CardTitle className="text-balance">Suggested job titles</CardTitle>
              <CardDescription className="text-pretty">
                Roles that match your experience and skills.
              </CardDescription>
              {!isLoading && jobTitles.length > 0 ? (
                <CardAction className="self-start">
                  <CopyButton
                    label="Copy all job titles to clipboard"
                    onCopy={handleCopyJobTitles}
                  />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent
              className="min-h-[120px] pt-0"
              aria-busy={isLoading}
              aria-live="polite"
            >
              {isLoading ? (
                <JobTitlesSkeleton />
              ) : error && jobTitles.length === 0 ? (
                <EmptyState
                  icon={<AlertCircle className="size-5" />}
                  title="Job titles unavailable"
                  description="We couldn't suggest titles for this file. Try uploading again."
                />
              ) : jobTitles.length > 0 ? (
                <ul
                  aria-label="Suggested job titles"
                  className="flex flex-wrap gap-2"
                >
                  {jobTitles.map((title) => (
                    <li
                      key={title}
                      className="inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium leading-none text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 hover:border-foreground/10 motion-reduce:transition-none dark:border-white/10 dark:bg-secondary"
                    >
                      {title}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<Briefcase className="size-5" />}
                  title="No job titles suggested"
                  description="Upload a resume to see roles matched to your background."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Improvements */}
        <TabsContent
          value="improvements"
          className="animate-in fade-in mt-3 duration-200 motion-reduce:animate-none sm:mt-4"
        >
          <Card className="overflow-hidden rounded-xl border-border/60 shadow-sm dark:border-white/10">
            <CardHeader className="gap-1.5 pb-3">
              <CardTitle className="text-balance">Improvements</CardTitle>
              <CardDescription className="text-pretty">
                Prioritized suggestions, sorted high → medium → low.
              </CardDescription>
              {!isLoading && improvements.length > 0 ? (
                <CardAction className="self-start">
                  <CopyButton
                    label="Copy all improvements to clipboard"
                    onCopy={handleCopyImprovements}
                  />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent
              className="min-h-[160px] pt-0"
              aria-busy={isLoading}
              aria-live="polite"
            >
              {isLoading ? (
                <ImprovementsSkeleton />
              ) : error && improvements.length === 0 ? (
                <EmptyState
                  icon={<AlertCircle className="size-5" />}
                  title="Improvements unavailable"
                  description="We couldn't generate suggestions for this file. Try uploading again."
                />
              ) : improvements.length > 0 ? (
                <ul
                  aria-label="Suggested improvements by priority"
                  className="flex flex-col gap-2.5"
                >
                  {improvements.map((item, index) => (
                    <li
                      key={`${item.priority}-${index}-${item.text.slice(0, 24)}`}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/30 motion-reduce:transition-none dark:border-white/10 dark:hover:bg-white/5"
                    >
                      <PriorityBadge priority={item.priority} />
                      <span className="flex-1 text-sm leading-7 text-pretty">
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<ListChecks className="size-5" />}
                  title="No improvements suggested"
                  description="Your resume looks solid — upload a file to get targeted feedback."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export {
  SummarySkeleton,
  JobTitlesSkeleton,
  ImprovementsSkeleton,
  sortImprovements,
  formatImprovements,
};

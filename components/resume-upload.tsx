"use client";

import * as React from "react";
import {
  AlertCircle,
  CloudUpload,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeResume } from "@/lib/api";
import {
  ALLOWED_EXTENSIONS,
  EXTENSION_TO_MIME,
  MAX_FILE_SIZE,
  type ResumeAnalysisResponse,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const RESUME_ACCEPT = ".pdf,.docx,.txt";

export interface ResumeUploadProps {
  /** Called with the validated analysis result on successful upload. */
  onUploadComplete?: (data: ResumeAnalysisResponse) => void;
  /** Called with the error on validation or upload failure. */
  onUploadError?: (error: Error) => void;
  /** Called when an upload begins. Useful for page-level loading UI. */
  onUploadStart?: (file: File) => void;
  /** Disables all interaction when true. */
  disabled?: boolean;
  /** Additional classes for the root element. */
  className?: string;
}

/**
 * Format a byte count as B / KB / MB for file-size display.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

/**
 * Client-side validation mirroring `lib/schemas.ts` constants.
 * Returns an error message, or `null` when the file is acceptable.
 */
export function validateResumeFile(file: File): string | null {
  const ext = getExtension(file.name);

  if (file.size > MAX_FILE_SIZE) {
    return "File must be ≤ 10MB";
  }

  if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }

  const expected =
    EXTENSION_TO_MIME[ext as keyof typeof EXTENSION_TO_MIME];
  // Some platforms report an empty type; only flag an explicit mismatch so
  // valid files aren't rejected client-side (the server re-validates).
  if (file.type && file.type !== expected) {
    return `File type doesn't match ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }

  return null;
}

export default function ResumeUpload({
  onUploadComplete,
  onUploadError,
  onUploadStart,
  disabled = false,
  className,
}: ResumeUploadProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");

  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropzoneRef = React.useRef<HTMLDivElement>(null);
  const dragCounter = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const busy = isUploading || disabled;
  const reactId = React.useId();
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;
  const statusId = `${reactId}-status`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  // Abort any in-flight upload on unmount.
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const openPicker = React.useCallback(() => {
    if (busy) return;
    inputRef.current?.click();
  }, [busy]);

  const clearSelection = React.useCallback(
    (focusDropzone = false) => {
      if (isUploading) return;
      abortRef.current?.abort();
      abortRef.current = null;
      setFile(null);
      setError(null);
      setStatus("");
      setIsDragging(false);
      dragCounter.current = 0;
      if (inputRef.current) inputRef.current.value = "";
      if (focusDropzone) dropzoneRef.current?.focus();
    },
    [isUploading],
  );

  const handleFile = React.useCallback(
    (next: File | undefined | null) => {
      if (!next || busy) return;
      const message = validateResumeFile(next);
      if (message) {
        setFile(null);
        setError(message);
        setStatus(`File rejected: ${next.name}. ${message}`);
        onUploadError?.(new Error(message));
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setError(null);
      setFile(next);
      setStatus(
        `Selected ${next.name}, ${formatFileSize(next.size)}. Ready to analyze.`,
      );
    },
    [busy, onUploadError],
  );

  const handleUpload = React.useCallback(async () => {
    if (!file || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);
    setError(null);
    setStatus(`Uploading ${file.name} for analysis…`);
    onUploadStart?.(file);
    try {
      const data = await analyzeResume(file, {
        signal: controller.signal,
      });
      onUploadComplete?.(data);
      setStatus(`Analysis complete for ${file.name}.`);
      // Reset to the initial state after a successful upload.
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("Upload cancelled.");
        return;
      }
      const message =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      setError(message);
      setStatus(`Upload failed: ${message}`);
      onUploadError?.(err instanceof Error ? err : new Error(message));
    } finally {
      abortRef.current = null;
      setIsDragging(false);
      dragCounter.current = 0;
      setIsUploading(false);
    }
  }, [busy, file, onUploadComplete, onUploadError, onUploadStart]);

  const handleCancel = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      if (busy) return;
      handleFile(e.dataTransfer.files?.[0]);
    },
    [busy, handleFile],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        // Space would otherwise scroll the page.
        e.preventDefault();
        openPicker();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearSelection(false);
        setStatus("Selection cleared.");
      }
    },
    [clearSelection, openPicker],
  );

  const extLabel = file ? getExtension(file.name).replace(".", "").toUpperCase() : null;

  return (
    <div className={cn("w-full", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
        }}
      />

      <div
        ref={dropzoneRef}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Upload resume. Drag and drop a file or press Enter to browse."
        aria-describedby={describedBy}
        aria-busy={isUploading}
        aria-disabled={busy}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragEnter={(e) => {
          e.preventDefault();
          if (busy) return;
          dragCounter.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (busy) return;
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragCounter.current = Math.max(0, dragCounter.current - 1);
          if (dragCounter.current === 0) setIsDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "group relative flex min-h-[220px] flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border bg-card px-4 py-8 text-center outline-none sm:min-h-[240px] sm:gap-5 sm:px-8 sm:py-10",
          "transition-colors duration-200 motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          busy && "cursor-not-allowed opacity-60",
          !busy && "cursor-pointer",
          isDragging && !busy
            ? "border-primary bg-primary/[0.06] shadow-[inset_0_1px_0_0_var(--primary)] dark:bg-primary/10 dark:border-primary/40"
            : error
              ? "border-destructive/40 bg-destructive/[0.04] dark:bg-destructive/10 dark:border-destructive/30"
              : "border-border hover:border-foreground/15 hover:bg-muted/30 dark:hover:bg-muted/20 dark:hover:border-white/10",
        )}
      >
        {/* Top accent hairline */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px transition-colors duration-200",
            isDragging && !busy
              ? "bg-primary"
              : error
                ? "bg-destructive/50"
                : "bg-border group-hover:bg-foreground/10",
          )}
        />
        {/* Subtle dot grid — decorative only */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 opacity-[0.025] transition-opacity duration-300",
            isDragging && !busy && "opacity-[0.06]",
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />
        {/* Corner brackets — editorial detail */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-3 top-3 size-3 border-l border-t transition-colors duration-200 sm:left-4 sm:top-4 sm:size-4",
            isDragging && !busy
              ? "border-primary"
              : error
                ? "border-destructive/40"
                : "border-border group-hover:border-foreground/20",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-3 right-3 size-3 border-b border-r transition-colors duration-200 sm:bottom-4 sm:right-4 sm:size-4",
            isDragging && !busy
              ? "border-primary"
              : error
                ? "border-destructive/40"
                : "border-border group-hover:border-foreground/20",
          )}
        />

        {/* Icon badge */}
        <div
          className={cn(
            "relative flex size-12 items-center justify-center rounded-lg border bg-background transition-all duration-200 sm:size-14",
            "motion-safe:transition-all motion-reduce:transition-none",
            isDragging && !busy
              ? "scale-[1.04] border-primary bg-primary text-primary-foreground shadow-sm dark:border-primary/50"
              : error
                ? "border-destructive/25 bg-destructive/[0.06] text-destructive dark:bg-destructive/10 dark:border-destructive/30"
                : isUploading
                  ? "border-border text-muted-foreground dark:border-white/10"
                  : "border-border text-muted-foreground group-hover:border-foreground/15 group-hover:text-foreground dark:border-white/10 dark:group-hover:border-white/15",
          )}
        >
          {isUploading ? (
            <Loader2
              className="size-6 motion-safe:animate-spin motion-reduce:animate-none sm:size-6"
              aria-hidden="true"
            />
          ) : (
            <CloudUpload
              className={cn(
                "size-6 transition-transform duration-200 motion-reduce:transition-none sm:size-6",
                isDragging && !busy && "scale-110 motion-safe:scale-110",
                error && "scale-100",
              )}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="relative flex max-w-[28rem] flex-col items-center gap-2">
          <p
            className={cn(
              "text-sm font-semibold tracking-tight sm:text-[15px]",
              error && "text-destructive dark:text-destructive",
              isDragging && !busy && "text-primary dark:text-primary",
            )}
          >
            {isUploading
              ? "Analyzing your resume…"
              : isDragging
                ? "Drop your resume here"
                : "Drag & drop your resume"}
          </p>
          <p
            id={hintId}
            className="max-w-full text-sm leading-relaxed text-muted-foreground"
          >
            {isUploading ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                This usually takes a few seconds
                <span className="inline-flex gap-1" aria-hidden="true">
                  <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms] motion-reduce:animate-none" />
                  <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms] motion-reduce:animate-none" />
                </span>
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
                <span
                  className={cn(
                    "underline decoration-primary/25 underline-offset-4 transition-colors",
                    !busy &&
                      "text-foreground decoration-primary/30 group-hover:decoration-primary/50 dark:decoration-primary/20",
                    error && "decoration-destructive/30",
                  )}
                >
                  click to browse
                </span>
                <span className="text-border max-sm:hidden" aria-hidden="true">
                  ·
                </span>
                <span className="whitespace-nowrap text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  PDF · DOCX · TXT · 10MB max
                </span>
              </span>
            )}
          </p>
        </div>

        {isUploading && (
          <Progress
            aria-label="Upload progress"
            value={null}
            className="relative w-full max-w-xs"
          />
        )}

        {/* Drag overlay hint — subtle scale */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 border-2 border-primary/0 bg-primary/[0.02] opacity-0 transition-all duration-200",
            isDragging && !busy && "border-primary/20 opacity-100",
          )}
        />
      </div>

      {file && !isUploading && (
        <div
          className={cn(
            "mt-3 flex items-center gap-3 rounded-xl border bg-card px-3 py-3 sm:px-4",
            "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
            error
              ? "border-destructive/30 dark:border-destructive/30"
              : "border-border shadow-sm dark:border-white/10",
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground dark:border-white/10 dark:bg-white/5 sm:size-11">
            <FileText className="size-5 shrink-0" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p
              title={file.name}
              className="truncate text-sm font-medium leading-none"
            >
              {file.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
              {extLabel && (
                <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest leading-none dark:border-white/10">
                  {extLabel}
                </span>
              )}
              <span>{formatFileSize(file.size)}</span>
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80"
                aria-hidden="true"
              >
                <span className="size-1 rounded-full bg-emerald-500" />
                Ready
              </span>
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Remove ${file.name}`}
            onClick={(e) => {
              e.stopPropagation();
              clearSelection(true);
              setStatus(`Removed ${file.name}.`);
            }}
            className="shrink-0 min-h-11 min-w-11 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" className="size-4" />
            Remove
          </Button>
        </div>
      )}

      {file && !isUploading && !error && (
        <div className="mt-3 flex flex-col gap-2 animate-in fade-in duration-200 motion-reduce:animate-none sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={busy}
            aria-label={`Analyze ${file.name}`}
            className="min-h-11 w-full sm:w-auto"
          >
            Analyze resume
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => clearSelection(true)}
            disabled={busy}
            className="min-h-11 w-full sm:w-auto"
          >
            Choose a different file
          </Button>
        </div>
      )}

      {isUploading && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="min-h-11"
          >
            Cancel upload
          </Button>
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={cn(
            "mt-3 flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-sm leading-relaxed text-destructive dark:border-destructive/30 dark:bg-destructive/15 dark:text-destructive",
            "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
        </p>
      )}

      {/* Polite announcements: selection, upload start/complete, removal. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}

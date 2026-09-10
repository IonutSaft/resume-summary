import type { Improvement, ResumeAnalysisResponse } from "@/lib/schemas";

export type { Improvement, ResumeAnalysisResponse };

export type ApiErrorResponse = { error: string };

export type AnalyzeResult = ResumeAnalysisResponse;

export type Priority = Improvement["priority"];

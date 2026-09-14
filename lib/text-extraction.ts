import mammoth from "mammoth";
import { extractText as unpdfExtractText } from "unpdf";

/**
 * Base error class for text extraction failures.
 * Provides a consistent error hierarchy for catch-handling.
 */
export class TextExtractionError extends Error {
  /**
   * Creates a new TextExtractionError.
   * @param message - Human-readable error description
   * @param options - Optional ErrorOptions for cause chaining
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TextExtractionError";
    Object.setPrototypeOf(this, TextExtractionError.prototype);
  }
}

/**
 * Error thrown when a file type is not supported for text extraction.
 * Supported types: .pdf, .docx, .txt
 */
export class UnsupportedFileTypeError extends TextExtractionError {
  /**
   * Creates a new UnsupportedFileTypeError.
   * @param message - Human-readable error description
   * @param options - Optional ErrorOptions for cause chaining
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnsupportedFileTypeError";
    Object.setPrototypeOf(this, UnsupportedFileTypeError.prototype);
  }
}

/**
 * Error thrown when extracted text is empty or below minimum length threshold.
 * Minimum required length is 10 characters after whitespace normalization.
 */
export class EmptyTextError extends TextExtractionError {
  /**
   * Creates a new EmptyTextError.
   * @param message - Human-readable error description
   * @param options - Optional ErrorOptions for cause chaining
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmptyTextError";
    Object.setPrototypeOf(this, EmptyTextError.prototype);
  }
}

/**
 * Normalizes whitespace in extracted text for consistent processing.
 * - Removes all carriage returns (\r)
 * - Collapses 3+ consecutive newlines into double newlines
 * - Trims leading/trailing whitespace
 * @param text - Raw extracted text
 * @returns Normalized text string
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Validates that extracted text meets minimum length requirement.
 * @param text - Normalized text to validate
 * @throws {EmptyTextError} If text is shorter than 10 characters after trimming
 */
function assertMinLength(text: string): void {
  if (text.trim().length < 10) {
    throw new EmptyTextError(
      "Extracted text is empty or too short (minimum 10 characters required)",
    );
  }
}

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
 * Extracts text content from a plain text file.
 * @param file - File object to extract text from
 * @returns Normalized text content
 * @throws {TextExtractionError} If reading or processing fails
 * @throws {EmptyTextError} If extracted text is too short
 */
export async function extractTextFromTXT(file: File): Promise<string> {
  try {
    const raw = await file.text();
    const normalized = normalizeWhitespace(raw);
    assertMinLength(normalized);
    return normalized;
  } catch (err) {
    if (err instanceof EmptyTextError) throw err;
    if (err instanceof TextExtractionError) throw err;
    throw new TextExtractionError(
      `Failed to extract text from TXT: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * Extracts text content from a DOCX file using mammoth.
 * @param file - File object to extract text from
 * @returns Normalized text content
 * @throws {TextExtractionError} If parsing or processing fails
 * @throws {EmptyTextError} If extracted text is too short
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const normalized = normalizeWhitespace(result.value);
    assertMinLength(normalized);
    return normalized;
  } catch (err) {
    if (err instanceof EmptyTextError) throw err;
    if (err instanceof TextExtractionError) throw err;
    throw new TextExtractionError(
      `Failed to extract text from DOCX: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * Extracts text content from a PDF file using unpdf.
 * @param file - File object to extract text from
 * @returns Normalized text content (all pages merged with newlines)
 * @throws {TextExtractionError} If parsing or processing fails
 * @throws {EmptyTextError} If extracted text is too short
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await unpdfExtractText(data, { mergePages: true });
    const rawText = Array.isArray(result.text)
      ? result.text.join("\n")
      : result.text;
    const normalized = normalizeWhitespace(rawText);
    assertMinLength(normalized);
    return normalized;
  } catch (err) {
    if (err instanceof EmptyTextError) throw err;
    if (err instanceof TextExtractionError) throw err;
    throw new TextExtractionError(
      `Failed to extract text from PDF: ${(err as Error).message}`,
      { cause: err },
    );
  }
}

/**
 * Main entry point for text extraction - routes to appropriate extractor by file extension.
 * @param file - File object to extract text from
 * @returns Normalized text content
 * @throws {UnsupportedFileTypeError} If file extension is not .pdf, .docx, or .txt
 * @throws {TextExtractionError} If extraction fails for supported types
 * @throws {EmptyTextError} If extracted text is too short
 */
export async function extractText(file: File): Promise<string> {
  const ext = getExtension(file.name);

  if (ext === ".txt") {
    return extractTextFromTXT(file);
  }
  if (ext === ".docx") {
    return extractTextFromDOCX(file);
  }
  if (ext === ".pdf") {
    return extractTextFromPDF(file);
  }

  throw new UnsupportedFileTypeError(
    `Unsupported file type: ${ext || "(no extension)"} (${file.type || "unknown mime"}). Allowed: .pdf, .docx, .txt`,
  );
}

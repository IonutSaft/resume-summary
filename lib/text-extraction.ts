import mammoth from "mammoth";
import { extractText as unpdfExtractText } from "unpdf";

export class TextExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TextExtractionError";
    Object.setPrototypeOf(this, TextExtractionError.prototype);
  }
}

export class UnsupportedFileTypeError extends TextExtractionError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnsupportedFileTypeError";
    Object.setPrototypeOf(this, UnsupportedFileTypeError.prototype);
  }
}

export class EmptyTextError extends TextExtractionError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmptyTextError";
    Object.setPrototypeOf(this, EmptyTextError.prototype);
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertMinLength(text: string): void {
  if (text.trim().length < 10) {
    throw new EmptyTextError(
      "Extracted text is empty or too short (minimum 10 characters required)",
    );
  }
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}

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

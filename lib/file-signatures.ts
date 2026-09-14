/**
 * Magic-byte validation for uploaded resume files (defense-in-depth:
 * verifies content matches extension beyond MIME/extension checks).
 *
 * Supported types: .pdf (%PDF), .docx (ZIP container), .txt (UTF-8 text, no NUL bytes).
 * Server-compatible (Node.js runtime). Uses File/Web APIs only.
 */

/**
 * Known magic-byte signatures for binary resume formats.
 */
export const FILE_SIGNATURES = {
  ".pdf": [0x25, 0x50, 0x44, 0x46],
  ".docx": [0x50, 0x4B, 0x03, 0x04],
} as const;

/** Maximum bytes to read for signature validation (8KB). */
const MAX_SCAN_BYTES = 8192;

/**
 * Normalizes a file extension for comparison.
 *
 * Lowercases the input and ensures a leading dot.
 *
 * @param ext - Raw extension (e.g. `"PDF"`, `".pdf"`, `"docx"`).
 * @returns Normalized extension (e.g. `".pdf"`).
 */
export function normalizeExtension(ext: string): string {
  const normalized = ext.trim().toLowerCase();
  if (normalized.length === 0) {
    return "";
  }
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function matchesBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

function isValidPdf(bytes: Uint8Array): boolean {
  return matchesBytes(bytes, FILE_SIGNATURES[".pdf"]);
}

function isValidDocx(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return false;
  }
  const third = bytes[2];
  const fourth = bytes[3];
  return (
    (third === 0x03 && fourth === 0x04) ||
    (third === 0x05 && fourth === 0x06) ||
    (third === 0x07 && fourth === 0x08)
  );
}

function isValidTxt(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x00) {
      return false;
    }
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a file's magic bytes against its expected extension.
 *
 * Never throws; returns `false` on any read/decode error, truncated
 * input, or unknown extension.
 *
 * @param file - File to validate.
 * @param expectedExt - Expected extension (e.g. `".pdf"`, `"PDF"`).
 * @returns `true` if the file's leading bytes match the expected type.
 */
export async function validateFileSignature(
  file: File,
  expectedExt: string,
): Promise<boolean> {
  try {
    const ext = normalizeExtension(expectedExt);
    if (ext !== ".pdf" && ext !== ".docx" && ext !== ".txt") {
      return false;
    }
    if (file.size === 0) {
      return false;
    }
    const buffer = await file.slice(0, MAX_SCAN_BYTES).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (ext === ".pdf") {
      return isValidPdf(bytes);
    }
    if (ext === ".docx") {
      return isValidDocx(bytes);
    }
    return isValidTxt(bytes);
  } catch {
    return false;
  }
}

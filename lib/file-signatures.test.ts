import { describe, it, expect } from "vitest";
import { validateFileSignature, FILE_SIGNATURES, normalizeExtension } from "@/lib/file-signatures";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeFile(bytes: number[] | string, name: string, type: string): File {
  if (typeof bytes === "string") {
    return new File([bytes], name, { type });
  }
  return new File([new Uint8Array(bytes)], name, { type });
}

// ---------------------------------------------------------------------------
// FILE_SIGNATURES
// ---------------------------------------------------------------------------
describe("FILE_SIGNATURES", () => {
  it("contains correct magic bytes for .pdf", () => {
    expect(FILE_SIGNATURES[".pdf"]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it("contains correct magic bytes for .docx", () => {
    expect(FILE_SIGNATURES[".docx"]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("contains only expected extensions or at least pdf and docx", () => {
    expect(FILE_SIGNATURES).toHaveProperty(".pdf");
    expect(FILE_SIGNATURES).toHaveProperty(".docx");
    expect(Array.isArray(FILE_SIGNATURES[".pdf"])).toBe(true);
    expect(Array.isArray(FILE_SIGNATURES[".docx"])).toBe(true);
    expect(FILE_SIGNATURES[".pdf"]).toHaveLength(4);
    expect(FILE_SIGNATURES[".docx"]).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// normalizeExtension
// ---------------------------------------------------------------------------
describe("normalizeExtension", () => {
  it('normalizes "PDF" -> ".pdf"', () => {
    expect(normalizeExtension("PDF")).toBe(".pdf");
  });

  it('normalizes ".PDF" -> ".pdf"', () => {
    expect(normalizeExtension(".PDF")).toBe(".pdf");
  });

  it('normalizes "docx" -> ".docx"', () => {
    expect(normalizeExtension("docx")).toBe(".docx");
  });

  it('leaves already normalized ".pdf" unchanged', () => {
    expect(normalizeExtension(".pdf")).toBe(".pdf");
  });

  it('leaves already normalized ".docx" unchanged', () => {
    expect(normalizeExtension(".docx")).toBe(".docx");
  });

  it('normalizes mixed case with dot ".PdF" -> ".pdf"', () => {
    expect(normalizeExtension(".PdF")).toBe(".pdf");
  });

  it('normalizes upper case without dot "DOCX" -> ".docx"', () => {
    expect(normalizeExtension("DOCX")).toBe(".docx");
  });

  it('normalizes "txt" -> ".txt"', () => {
    expect(normalizeExtension("txt")).toBe(".txt");
  });

  it('normalizes ".TXT" -> ".txt"', () => {
    expect(normalizeExtension(".TXT")).toBe(".txt");
  });
});

// ---------------------------------------------------------------------------
// validateFileSignature
// ---------------------------------------------------------------------------
describe("validateFileSignature", () => {
  // -------------------------------------------------------
  // PDF
  // -------------------------------------------------------
  describe("PDF magic bytes", () => {
    it("returns true for valid PDF bytes with .pdf extension", async () => {
      // %PDF + rest
      const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25];
      const file = makeFile(pdfBytes, "resume.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(true);
    });

    it("returns false for valid PDF bytes with .docx extension", async () => {
      const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
      const file = makeFile(pdfBytes, "resume.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });

    it("handles extension case insensitivity for PDF (PDF / .PDF)", async () => {
      const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x00, 0x01];
      const file = makeFile(pdfBytes, "resume.pdf", "application/pdf");
      await expect(validateFileSignature(file, "PDF")).resolves.toBe(true);
      await expect(validateFileSignature(file, ".PDF")).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------
  // DOCX
  // -------------------------------------------------------
  describe("DOCX magic bytes", () => {
    it("returns true for valid DOCX bytes with .docx extension", async () => {
      // PK\x03\x04 + rest
      const docxBytes = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
      const file = makeFile(docxBytes, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(true);
    });

    it("returns false for valid DOCX bytes with .pdf extension", async () => {
      const docxBytes = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
      const file = makeFile(docxBytes, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("handles extension case insensitivity for DOCX (docx / DOCX)", async () => {
      const docxBytes = [0x50, 0x4b, 0x03, 0x04, 0x00, 0x01];
      const file = makeFile(docxBytes, "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, "docx")).resolves.toBe(true);
      await expect(validateFileSignature(file, "DOCX")).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------
  // TXT – valid UTF-8
  // -------------------------------------------------------
  describe("TXT validation – valid UTF-8", () => {
    it("returns true for plain ASCII text with .txt", async () => {
      const file = makeFile("Hello world, this is a valid resume text content.", "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(true);
    });

    it("returns true for UTF-8 text with unicode and emoji with .txt", async () => {
      const file = makeFile("Café naïve résumé — emoji test 🎉🚀 ✨ and unicode 中文", "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(true);
    });

    it("returns true for .txt with extension variants (txt, TXT, .TXT)", async () => {
      const file = makeFile("Valid txt content with sufficient length for testing.", "resume.txt", "text/plain");
      await expect(validateFileSignature(file, "txt")).resolves.toBe(true);
      await expect(validateFileSignature(file, "TXT")).resolves.toBe(true);
      await expect(validateFileSignature(file, ".TXT")).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------
  // TXT – invalid: null byte, invalid UTF-8
  // -------------------------------------------------------
  describe("TXT validation – invalid content", () => {
    it("returns false for TXT containing null byte", async () => {
      const withNull = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64];
      const file = makeFile(withNull, "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("returns false for TXT containing null byte via string", async () => {
      const file = makeFile("hello\x00world", "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("returns false for TXT with invalid UTF-8 bytes [0xFF, 0xFE]", async () => {
      const invalid = [0xff, 0xfe, 0x48, 0x65, 0x6c, 0x6c, 0x6f];
      const file = makeFile(invalid, "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("returns false for TXT with lone 0xFF byte among valid text", async () => {
      const invalid = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xff, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64];
      const file = makeFile(invalid, "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("returns false for TXT with truncated multi-byte sequence [0xC3]", async () => {
      const invalid = [0xc3, 0x48, 0x65, 0x6c, 0x6c, 0x6f];
      const file = makeFile(invalid, "resume.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });
  });

  // -------------------------------------------------------
  // Empty file
  // -------------------------------------------------------
  describe("empty file", () => {
    it("returns false for empty file with .pdf", async () => {
      const file = makeFile([], "empty.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("returns false for empty file with .docx", async () => {
      const file = makeFile([], "empty.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });

    it("returns false for empty file with .txt", async () => {
      const file = makeFile("", "empty.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("returns false for empty file with .exe (unknown)", async () => {
      const file = makeFile([], "empty.exe", "application/octet-stream");
      await expect(validateFileSignature(file, ".exe")).resolves.toBe(false);
    });
  });

  // -------------------------------------------------------
  // Truncated
  // -------------------------------------------------------
  describe("truncated files", () => {
    it("returns false for truncated PDF (<4 bytes) [0x25,0x50] with .pdf", async () => {
      const file = makeFile([0x25, 0x50], "truncated.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("returns false for 3-byte truncated PDF [0x25,0x50,0x44] with .pdf", async () => {
      const file = makeFile([0x25, 0x50, 0x44], "truncated.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("returns false for single byte file with .pdf", async () => {
      const file = makeFile([0x25], "truncated.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("returns false for truncated DOCX (<4 bytes) with .docx", async () => {
      const file = makeFile([0x50, 0x4b], "truncated.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });

    it("returns false for truncated DOCX 3 bytes with .docx", async () => {
      const file = makeFile([0x50, 0x4b, 0x03], "truncated.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });
  });

  // -------------------------------------------------------
  // Unknown extension
  // -------------------------------------------------------
  describe("unknown extensions", () => {
    it("returns false for .exe with arbitrary content", async () => {
      const file = makeFile([0x25, 0x50, 0x44, 0x46], "malware.exe", "application/octet-stream");
      await expect(validateFileSignature(file, ".exe")).resolves.toBe(false);
    });

    it("returns false for .png with arbitrary content", async () => {
      const file = makeFile([0x89, 0x50, 0x4e, 0x47], "image.png", "image/png");
      await expect(validateFileSignature(file, ".png")).resolves.toBe(false);
    });

    it("returns false for .zip extension", async () => {
      const file = makeFile([0x50, 0x4b, 0x03, 0x04], "archive.zip", "application/zip");
      await expect(validateFileSignature(file, ".zip")).resolves.toBe(false);
    });

    it("returns false for unknown extension even with valid PDF bytes", async () => {
      const file = makeFile([0x25, 0x50, 0x44, 0x46, 0x2d], "file.unknown", "application/octet-stream");
      await expect(validateFileSignature(file, ".unknown")).resolves.toBe(false);
    });
  });

  // -------------------------------------------------------
  // Cross-spoof
  // -------------------------------------------------------
  describe("cross-spoof protection", () => {
    it("rejects PDF bytes when expected is .docx", async () => {
      const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a];
      const file = makeFile(pdfBytes, "spoof.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });

    it("rejects DOCX bytes when expected is .pdf", async () => {
      const docxBytes = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00];
      const file = makeFile(docxBytes, "spoof.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("rejects EXE MZ bytes [0x4D,0x5A] for .pdf", async () => {
      const mzBytes = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
      const file = makeFile(mzBytes, "malware.pdf", "application/pdf");
      await expect(validateFileSignature(file, ".pdf")).resolves.toBe(false);
    });

    it("rejects EXE MZ bytes [0x4D,0x5A] for .docx", async () => {
      const mzBytes = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
      const file = makeFile(mzBytes, "malware.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await expect(validateFileSignature(file, ".docx")).resolves.toBe(false);
    });

    it("rejects EXE MZ bytes [0x4D,0x5A] for .txt", async () => {
      const mzBytes = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
      const file = makeFile(mzBytes, "malware.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("rejects DOCX bytes when expected is .txt", async () => {
      const docxBytes = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];
      const file = makeFile(docxBytes, "spoof.txt", "text/plain");
      await expect(validateFileSignature(file, ".txt")).resolves.toBe(false);
    });

    it("rejects random bytes for all known extensions", async () => {
      const random = [0x00, 0x01, 0x02, 0x03, 0x04];
      const filePdf = makeFile(random, "a.pdf", "application/pdf");
      const fileDocx = makeFile(random, "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const fileTxt = makeFile(random, "a.txt", "text/plain");
      await expect(validateFileSignature(filePdf, ".pdf")).resolves.toBe(false);
      await expect(validateFileSignature(fileDocx, ".docx")).resolves.toBe(false);
      // random contains null byte so txt should fail; even without null it would be control chars
      await expect(validateFileSignature(fileTxt, ".txt")).resolves.toBe(false);
    });
  });
});

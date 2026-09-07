import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

vi.mock("unpdf", () => ({
  extractText: vi.fn(),
}));

import mammoth from "mammoth";
import { extractText as unpdfExtractText } from "unpdf";
import {
  TextExtractionError,
  UnsupportedFileTypeError,
  EmptyTextError,
  extractTextFromTXT,
  extractTextFromDOCX,
  extractTextFromPDF,
  extractText,
} from "./text-extraction";

const mammothMock = vi.mocked(mammoth.extractRawText);
const unpdfMock = vi.mocked(unpdfExtractText);

function makeFile(content: BlobPart | BlobPart[], name: string, type: string): File {
  const parts = Array.isArray(content) ? content : [content];
  return new File(parts as BlobPart[], name, { type });
}

describe("error classes", () => {
  it("TextExtractionError has correct name and instanceof Error", () => {
    const err = new TextExtractionError("base");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TextExtractionError);
    expect(err.name).toBe("TextExtractionError");
    expect(err.message).toBe("base");
  });

  it("UnsupportedFileTypeError extends TextExtractionError", () => {
    const err = new UnsupportedFileTypeError("unsupported");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TextExtractionError);
    expect(err).toBeInstanceOf(UnsupportedFileTypeError);
    expect(err.name).toBe("UnsupportedFileTypeError");
  });

  it("EmptyTextError extends TextExtractionError", () => {
    const err = new EmptyTextError("empty");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TextExtractionError);
    expect(err).toBeInstanceOf(EmptyTextError);
    expect(err.name).toBe("EmptyTextError");
  });
});

describe("extractTextFromTXT", () => {
  it("extracts valid TXT file content correctly", async () => {
    const file = makeFile("hello world content that is long enough", "resume.txt", "text/plain");
    const result = await extractTextFromTXT(file);
    expect(result).toBe("hello world content that is long enough");
  });

  it("trims surrounding whitespace", async () => {
    const file = makeFile("   hello world content that is long enough   ", "resume.txt", "text/plain");
    const result = await extractTextFromTXT(file);
    expect(result).toBe("hello world content that is long enough");
  });

  it("normalizes whitespace inside TXT (\\r and 3+ newlines)", async () => {
    const file = makeFile("hello\r\nworld\n\n\n\nnext section that is long enough", "resume.txt", "text/plain");
    const result = await extractTextFromTXT(file);
    expect(result).toBe("hello\nworld\n\nnext section that is long enough");
    expect(result).not.toContain("\r");
  });

  it("throws EmptyTextError for empty file", async () => {
    const file = makeFile("", "resume.txt", "text/plain");
    await expect(extractTextFromTXT(file)).rejects.toThrow(EmptyTextError);
    await expect(extractTextFromTXT(file)).rejects.toThrow(/empty|too short/i);
  });

  it("throws EmptyTextError for whitespace-only file", async () => {
    const file = makeFile("   \n\n  \t  ", "resume.txt", "text/plain");
    await expect(extractTextFromTXT(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError when content is less than 10 chars after trim", async () => {
    const file = makeFile("  hi  ", "resume.txt", "text/plain");
    await expect(extractTextFromTXT(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError when content is 9 chars after trim", async () => {
    const file = makeFile("123456789", "resume.txt", "text/plain");
    await expect(extractTextFromTXT(file)).rejects.toThrow(EmptyTextError);
  });

  it("does not throw for exactly 10 chars", async () => {
    const file = makeFile("1234567890", "resume.txt", "text/plain");
    await expect(extractTextFromTXT(file)).resolves.toBe("1234567890");
  });
});

describe("extractTextFromDOCX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text via mammoth with Buffer and trims", async () => {
    mammothMock.mockResolvedValue({ value: "  docx hello world content long enough  ", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const result = await extractTextFromDOCX(file);
    expect(mammothMock).toHaveBeenCalledTimes(1);
    const arg = mammothMock.mock.calls[0][0] as { buffer: Buffer };
    expect(arg.buffer).toBeInstanceOf(Buffer);
    expect(result).toBe("docx hello world content long enough");
  });

  it("normalizes whitespace from mammoth output", async () => {
    mammothMock.mockResolvedValue({ value: "hello\r\nworld\n\n\n\nnext that is long enough content", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const result = await extractTextFromDOCX(file);
    expect(result).toBe("hello\nworld\n\nnext that is long enough content");
  });

  it("throws EmptyTextError when mammoth returns empty string", async () => {
    mammothMock.mockResolvedValue({ value: "   ", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(extractTextFromDOCX(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError when mammoth returns less than 10 chars", async () => {
    mammothMock.mockResolvedValue({ value: "short", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(extractTextFromDOCX(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws TextExtractionError when mammoth throws", async () => {
    mammothMock.mockRejectedValue(new Error("mammoth failed"));
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(extractTextFromDOCX(file)).rejects.toThrow(TextExtractionError);
    await expect(extractTextFromDOCX(file)).rejects.not.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError directly without wrapping when content empty (not TextExtractionError)", async () => {
    mammothMock.mockResolvedValue({ value: "", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    try {
      await extractTextFromDOCX(file);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EmptyTextError);
      expect((e as Error).name).toBe("EmptyTextError");
    }
  });
});

describe("extractTextFromPDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text via unpdf and trims", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "  pdf hello world content long enough  " });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractTextFromPDF(file);
    expect(unpdfMock).toHaveBeenCalledTimes(1);
    const dataArg = unpdfMock.mock.calls[0][0];
    expect(dataArg).toBeInstanceOf(Uint8Array);
    expect(result).toBe("pdf hello world content long enough");
  });

  it("joins multi-page array text with \\n", async () => {
    unpdfMock.mockResolvedValue({
      totalPages: 2,
      text: ["page one content long enough here", "page two content long enough here"],
    });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractTextFromPDF(file);
    expect(result).toBe("page one content long enough here\npage two content long enough here");
  });

  it("joins multi-page array with normalization", async () => {
    unpdfMock.mockResolvedValue({
      totalPages: 2,
      text: ["hello\r\nworld", "next\n\n\n\nsection that is long enough content"],
    });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractTextFromPDF(file);
    // joined with \n then normalized: "hello\r\nworld\nnext\n\n\n\nsection..." -> "hello\nworld\nnext\n\nsection..."
    expect(result).toBe("hello\nworld\nnext\n\nsection that is long enough content");
  });

  it("handles mergePages:true string result", async () => {
    unpdfMock.mockResolvedValue({
      totalPages: 2,
      text: "page one content long enough here\npage two content long enough here",
    });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractTextFromPDF(file);
    expect(result).toBe("page one content long enough here\npage two content long enough here");
  });

  it("normalizes whitespace in PDF output", async () => {
    unpdfMock.mockResolvedValue({
      totalPages: 1,
      text: "hello\r\nworld\n\n\n\nnext that is long enough content",
    });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractTextFromPDF(file);
    expect(result).toBe("hello\nworld\n\nnext that is long enough content");
    expect(result).not.toContain("\r");
  });

  it("throws EmptyTextError when PDF returns empty string", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "   " });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    await expect(extractTextFromPDF(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError when PDF returns empty array", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 2, text: ["  ", "  "] });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    await expect(extractTextFromPDF(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws EmptyTextError when PDF text is less than 10 chars", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "short" });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    await expect(extractTextFromPDF(file)).rejects.toThrow(EmptyTextError);
  });

  it("throws TextExtractionError when unpdf throws", async () => {
    unpdfMock.mockRejectedValue(new Error("pdf failed"));
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    await expect(extractTextFromPDF(file)).rejects.toThrow(TextExtractionError);
    await expect(extractTextFromPDF(file)).rejects.not.toThrow(EmptyTextError);
  });

  it("is called with Uint8Array from file.arrayBuffer()", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "pdf hello world long enough content" });
    const file = makeFile(new TextEncoder().encode("fake pdf bytes"), "resume.pdf", "application/pdf");
    await extractTextFromPDF(file);
    expect(unpdfMock).toHaveBeenCalledWith(expect.any(Uint8Array), { mergePages: true });
  });
});

describe("extractText dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes .txt files to TXT extraction", async () => {
    const file = makeFile("dispatcher txt content long enough here", "resume.txt", "text/plain");
    const result = await extractText(file);
    expect(result).toBe("dispatcher txt content long enough here");
  });

  it("routes .pdf files to PDF extraction (via mock)", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "dispatcher pdf content long enough here" });
    const file = makeFile("fake", "resume.pdf", "application/pdf");
    const result = await extractText(file);
    expect(unpdfMock).toHaveBeenCalled();
    expect(result).toBe("dispatcher pdf content long enough here");
  });

  it("routes .docx files to DOCX extraction (via mock)", async () => {
    mammothMock.mockResolvedValue({ value: "dispatcher docx content long enough here", messages: [] });
    const file = makeFile("fake", "resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const result = await extractText(file);
    expect(mammothMock).toHaveBeenCalled();
    expect(result).toBe("dispatcher docx content long enough here");
  });

  it("is case-insensitive for extension .PDF", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "case insensitive pdf long enough content" });
    const file = makeFile("fake", "resume.PDF", "application/pdf");
    const result = await extractText(file);
    expect(result).toBe("case insensitive pdf long enough content");
  });

  it("is case-insensitive for extension .DOCX", async () => {
    mammothMock.mockResolvedValue({ value: "case insensitive docx long enough content", messages: [] });
    const file = makeFile("fake", "resume.DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const result = await extractText(file);
    expect(result).toBe("case insensitive docx long enough content");
  });

  it("is case-insensitive for extension .TXT", async () => {
    const file = makeFile("case insensitive txt long enough content", "resume.TXT", "text/plain");
    const result = await extractText(file);
    expect(result).toBe("case insensitive txt long enough content");
  });

  it("throws UnsupportedFileTypeError for .exe", async () => {
    const file = makeFile("fake", "malware.exe", "application/octet-stream");
    await expect(extractText(file)).rejects.toThrow(UnsupportedFileTypeError);
    await expect(extractText(file)).rejects.toThrow(TextExtractionError);
  });

  it("throws UnsupportedFileTypeError for .png", async () => {
    const file = makeFile("fake", "image.png", "image/png");
    await expect(extractText(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("throws UnsupportedFileTypeError for unknown extension even if mime is pdf but extension not allowed", async () => {
    const file = makeFile("fake", "resume.unknown", "application/pdf");
    await expect(extractText(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("normalizes whitespace via dispatcher for TXT", async () => {
    const file = makeFile("hello\r\nworld\n\n\n\nnext section long enough content", "resume.txt", "text/plain");
    const result = await extractText(file);
    expect(result).toBe("hello\nworld\n\nnext section long enough content");
  });

  it("throws EmptyTextError via dispatcher when content too short", async () => {
    const file = makeFile("short", "resume.txt", "text/plain");
    await expect(extractText(file)).rejects.toThrow(EmptyTextError);
  });

  it("falls back to mime type when extension missing but mime is allowed? - should throw unsupported", async () => {
    const file = makeFile("some long enough content here", "resume", "text/plain");
    // No extension -> unsupported regardless of mime per spec (throws)
    await expect(extractText(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("routes by mime type when extension is lowercase .pdf but file has mixed case .PdF", async () => {
    unpdfMock.mockResolvedValue({ totalPages: 1, text: "mixed case pdf long enough content here" });
    const file = makeFile("fake", "resume.PdF", "application/pdf");
    const result = await extractText(file);
    expect(result).toBe("mixed case pdf long enough content here");
  });
});

describe("whitespace normalization (unit)", () => {
  it("collapses \\r and 3+ newlines to 2 via TXT extraction", async () => {
    const file = makeFile("a long enough header\r\n\r\n\n\n\nfooter long enough content", "resume.txt", "text/plain");
    const result = await extractTextFromTXT(file);
    expect(result).not.toContain("\r");
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("\n\n");
  });

  it("trims leading and trailing newlines/spaces", async () => {
    const file = makeFile("\n\n  hello world content long enough  \n\n", "resume.txt", "text/plain");
    const result = await extractTextFromTXT(file);
    expect(result).toBe("hello world content long enough");
  });
});

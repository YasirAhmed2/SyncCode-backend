import pdfParse from "pdf-parse/lib/pdf-parse.js";

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

/**
 * Checks whether the uploaded file is supported by extension or MIME type.
 */
export function isSupportedFile(fileName?: string, mimeType?: string): boolean {
  if (mimeType && SUPPORTED_MIME_TYPES.has(mimeType)) {
    return true;
  }
  if (fileName) {
    const lower = fileName.toLowerCase();
    return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  return false;
}

/**
 * Extracts raw text content from an uploaded document buffer.
 */
export async function extractText(
  buffer: Buffer,
  fileName?: string,
  mimeType?: string
): Promise<string> {
  const isPdf =
    (mimeType && mimeType === "application/pdf") ||
    (fileName && fileName.toLowerCase().endsWith(".pdf"));

  if (isPdf) {
    const data = await pdfParse(buffer);
    return (data?.text || "").trim();
  }

  // Treat as text / markdown file
  return buffer.toString("utf-8").trim();
}

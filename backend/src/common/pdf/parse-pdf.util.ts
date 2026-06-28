/**
 * Single entry point for reading text + page count out of a PDF buffer.
 *
 * pdf-parse v2 is class-based (`new PDFParse({ data }).getText()`); calling the
 * module as a function — the v1 API — throws `pdf-parse is not a function`.
 * The v2 upgrade (pdf-parse@^2.4.5) migrated the evidence processor but left
 * the drawings service and the P6-PDF parser on the v1 function call, so those
 * uploads threw at runtime. Routing every reader through this helper makes a
 * future major bump break in exactly one place. Falls back to the v1 function
 * shape if a v1 pdf-parse is ever installed.
 */
export async function parsePdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('pdf-parse');
  const PDFParse = (
    mod as {
      PDFParse?: new (o: { data: Buffer }) => {
        getText(): Promise<{ text?: string; total?: number; pages?: unknown[] }>;
        destroy(): Promise<void>;
      };
    }
  ).PDFParse;

  if (PDFParse) {
    const parser = new PDFParse({ data: buffer });
    try {
      const r = await parser.getText();
      return { text: r?.text ?? '', pageCount: r?.total ?? (Array.isArray(r?.pages) ? r.pages.length : 0) };
    } finally {
      try {
        await parser.destroy();
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  // v1 fallback: module (or its default) is the parse function.
  const fn =
    (mod as { default?: (b: Buffer) => Promise<{ text?: string; numpages?: number }> }).default ??
    (mod as (b: Buffer) => Promise<{ text?: string; numpages?: number }>);
  const r = await fn(buffer);
  return { text: r?.text ?? '', pageCount: r?.numpages ?? 0 };
}

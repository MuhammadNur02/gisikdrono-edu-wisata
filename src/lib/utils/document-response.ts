// The responses of the routes that stream private documents (docs/Security.md §10.3; CLAUDE.md §5.4): never cached,
// never indexed, a PDF shown inline under its own file name.

export const DOCUMENT_HTTP_STATUS = {
  ok: 200,
  found: 302,
  seeOther: 303,
  notFound: 404,
  tooManyRequests: 429,
  unavailable: 503,
} as const;

export const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
} as const;

export function plainResponse(
  status: number,
  text: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(text, {
    status,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

export function pdfResponse(fileName: string, pdf: Buffer): Response {
  return new Response(new Uint8Array(pdf), {
    status: DOCUMENT_HTTP_STATUS.ok,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': String(pdf.length),
    },
  });
}

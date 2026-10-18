// Reads the small JSON body of a staff route handler (CLAUDE.md §5.4: every handler refuses a body above its
// cap and parses it with zod afterwards). The answer is the parsed value, or the status to refuse with.

const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const BAD_REQUEST = 400;
const JSON_TYPE = 'application/json';

export type JsonBody = { ok: true; value: unknown } | { ok: false; status: number };

function isJson(contentType: string | null): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === JSON_TYPE;
}

export async function readJsonBody(request: Request, limitBytes: number): Promise<JsonBody> {
  if (!isJson(request.headers.get('content-type'))) {
    return { ok: false, status: UNSUPPORTED_MEDIA_TYPE };
  }
  // The declared length turns a large body away before it is read; the real length is checked after.
  if (Number(request.headers.get('content-length') ?? 0) > limitBytes) {
    return { ok: false, status: PAYLOAD_TOO_LARGE };
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > limitBytes) return { ok: false, status: PAYLOAD_TOO_LARGE };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: BAD_REQUEST };
  }
}

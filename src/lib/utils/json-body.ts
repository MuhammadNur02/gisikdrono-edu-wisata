// Reads the small JSON body of a staff route handler (CLAUDE.md §5.4: every handler refuses a body above its
// cap and parses it with zod afterwards). The answer is the parsed value, or the status to refuse with.

const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const BAD_REQUEST = 400;
const JSON_TYPE = 'application/json';

export type JsonBody = { ok: true; value: unknown } | { ok: false; status: number };
export type TextBody = { ok: true; text: string } | { ok: false; status: number };

function isJson(contentType: string | null): boolean {
  return contentType?.split(';')[0]?.trim().toLowerCase() === JSON_TYPE;
}

// The body as text, or null once it passes the limit. A body sent without a length (chunked) is read only that
// far, never whole (security review of PR #14, L5).
async function readUpTo(request: Request, limitBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > limitBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// A JSON body as the raw text it arrived as, for a caller that must hash or sign exactly those bytes (the Midtrans
// webhook, CLAUDE.md §7.2 step 3).
export async function readJsonText(request: Request, limitBytes: number): Promise<TextBody> {
  if (!isJson(request.headers.get('content-type'))) {
    return { ok: false, status: UNSUPPORTED_MEDIA_TYPE };
  }
  // The declared length turns a large body away before it is read; the real length is checked after.
  if (Number(request.headers.get('content-length') ?? 0) > limitBytes) {
    return { ok: false, status: PAYLOAD_TOO_LARGE };
  }
  const text = await readUpTo(request, limitBytes);
  return text === null ? { ok: false, status: PAYLOAD_TOO_LARGE } : { ok: true, text };
}

export async function readJsonBody(request: Request, limitBytes: number): Promise<JsonBody> {
  const body = await readJsonText(request, limitBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) as unknown };
  } catch {
    return { ok: false, status: BAD_REQUEST };
  }
}

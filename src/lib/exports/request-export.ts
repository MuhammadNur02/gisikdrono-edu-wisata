import { z } from 'zod';

import { exportRequestSchema, type ExportRequest } from '@/lib/validations/export';
import type { ActionResult } from '@/types/action-result';
import type { CreatedExport } from '@/types/export';

// The dashboard form's call to POST /api/export/[kind] (Task P4.6.03). The route answers the same ActionResult a
// Server Action would, under its HTTP status; anything else (a proxy's error page, a dropped connection) reads as
// INTERNAL with the form's generic message.

const errorCodes = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'QUOTA_EXCEEDED',
  'STATE_INVALID',
  'PRICE_MISMATCH',
  'RATE_LIMITED',
  'PAYMENT',
  'INTERNAL',
] as const;

const answerSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.object({ exportId: z.uuid(), rowCount: z.number().int(), url: z.url() }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(errorCodes),
      message: z.string(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    }),
  }),
]);

export function exportResultOf(
  body: unknown,
  fallbackMessage: string,
): ActionResult<CreatedExport> {
  const parsed = answerSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  return { ok: false, error: { code: 'INTERNAL', message: fallbackMessage } };
}

// The site's own route, by a literal path per kind (.semgrep/rules.yml fetch-outside-adapters).
function postExport(kind: ExportRequest['kind'], init: RequestInit): Promise<Response> {
  switch (kind) {
    case 'visits':
      return fetch('/api/export/visits', init);
    case 'attendance':
      return fetch('/api/export/attendance', init);
    case 'finance':
      return fetch('/api/export/finance', init);
    case 'audit':
      return fetch('/api/export/audit', init);
  }
}

export async function requestExport(
  values: unknown,
  fallbackMessage: string,
): Promise<ActionResult<CreatedExport>> {
  const parsed = exportRequestSchema.safeParse(values);
  if (!parsed.success)
    return { ok: false, error: { code: 'VALIDATION', message: fallbackMessage } };
  const { kind, ...body } = parsed.data;
  try {
    const response = await postExport(kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return exportResultOf(await response.json().catch(() => null), fallbackMessage);
  } catch {
    return exportResultOf(null, fallbackMessage);
  }
}

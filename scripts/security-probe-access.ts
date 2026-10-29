import {
  expectStatus,
  guarded,
  randomBookingCode,
  randomHexToken,
  randomUUID,
  type Probe,
  type ProbeCheck,
  type ProbeOutcome,
} from './security-probe-client';
import { HTTP, loginRedirectProblems, piiProblems } from './security-probe-rules';
import { createUuidV7 } from '../src/lib/utils/uuid-v7';

// The refusals of Task P5.2.02 a visitor without a session can try (docs/Security.md §6.9, §8.2; the matrix of
// tests/e2e/security.spec.ts and security-matrix.spec.ts, run here against a deployment instead of the CI build).
// Nothing here writes a row: every request is refused before the database is asked to change anything.

const DASHBOARD_PATHS = [
  '/dashboard',
  '/dashboard/bookings',
  '/dashboard/finance',
  '/dashboard/scanner',
  '/dashboard/users',
  '/dashboard/exports',
];
const JOB_PATHS = [
  '/api/jobs/anomaly-scan',
  '/api/jobs/expire-bookings',
  '/api/jobs/payments-poll',
  '/api/jobs/process-notifications',
  '/api/jobs/purge-storage',
  '/api/jobs/reconcile-payments',
];
const DOCUMENT_KINDS = ['quotation', 'invoice', 'receipt', 'ticket', 'certificate'];
const EXPORT_KINDS = ['visits', 'attendance', 'finance', 'audit'];
// A well-formed body for each: the upload routes validate before they guard, as every staff route does
// (CLAUDE.md §5.2), so only a body that passes its schema reaches the session check under test.
const UPLOAD_BODIES: Record<string, () => object> = {
  '/api/uploads/sign': () => ({
    rwId: null,
    contentType: 'image/webp',
    size: 100,
    leadingBytes: 'UklGRg==',
  }),
  '/api/uploads/sign-pages': () => ({ rwId: null, bookletId: randomUUID() }),
  '/api/uploads/finalize': () => ({ path: `kelurahan/${createUuidV7()}`, purpose: 'hero' }),
};
const FOREIGN_ORIGIN = 'https://evil.example';
const REFUSED = [HTTP.unauthorized, HTTP.forbidden];
const REFUSED_OR_UNKNOWN = [HTTP.unauthorized, HTTP.forbidden, HTTP.notFound];
const JSON_HEADERS = { 'content-type': 'application/json' };
const TICKET_INVALID_TEXT = 'Tiket tidak valid';
// A Server Action id of the right length that no action carries; the origin check runs before the id is looked up.
const ACTION_ID_LENGTH = 42;
const UNKNOWN_ACTION_ID = '0'.repeat(ACTION_ID_LENGTH);

function dashboardChecks(probe: Probe): ProbeCheck[] {
  return DASHBOARD_PATHS.map((path) =>
    guarded(`GET ${path} without a session goes to /login`, async () => {
      const response = await probe.request(path);
      return loginRedirectProblems(path, response.status, response.headers.get('location'));
    }),
  );
}

function jobChecks(probe: Probe): ProbeCheck[] {
  return JOB_PATHS.map((path) =>
    guarded(`POST ${path} without or with a wrong bearer is a 401`, async () => {
      const without = await probe.request(path, { method: 'POST' });
      const wrong = await probe.request(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${randomHexToken()}` },
      });
      return [
        ...expectStatus(without, [HTTP.unauthorized]),
        ...expectStatus(wrong, [HTTP.unauthorized]),
      ];
    }),
  );
}

// A webhook whose signing secret this deployment does not have answers 503 before it reads a signature, so the
// provider retries later (CLAUDE.md §5.4). That fails closed, yet it means the 403 was not reached: a warning to
// review, which production must never show.
function signatureRefusal(response: Response): ProbeOutcome {
  if (response.status !== HTTP.serviceUnavailable) {
    return { problems: expectStatus(response, [HTTP.forbidden]) };
  }
  return {
    problems: [],
    warnings: ['503: the signing secret is not configured here, so the 403 was never reached'],
  };
}

function webhookChecks(probe: Probe): ProbeCheck[] {
  const post = (path: string, headers: Record<string, string>) =>
    probe.request(path, {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...headers },
      body: JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
    });
  return [
    guarded('POST the Midtrans webhook under a random path token is a 404', async () =>
      expectStatus(await post(`/api/webhooks/midtrans/${randomHexToken()}`, {}), [HTTP.notFound]),
    ),
    guarded('POST the WhatsApp webhook with a bad signature is a 403', async () => {
      const signature = `sha256=${randomHexToken()}${randomHexToken()}`;
      return signatureRefusal(
        await post('/api/webhooks/whatsapp', { 'x-hub-signature-256': signature }),
      );
    }),
    guarded('GET the WhatsApp handshake with a wrong verify token is a 403', async () => {
      const query = `hub.mode=subscribe&hub.verify_token=${randomHexToken()}&hub.challenge=123`;
      return expectStatus(await probe.request(`/api/webhooks/whatsapp?${query}`), [HTTP.forbidden]);
    }),
    guarded('POST the Resend webhook without a Svix signature is a 403', async () =>
      signatureRefusal(await post('/api/webhooks/resend', {})),
    ),
  ];
}

function documentChecks(probe: Probe): ProbeCheck[] {
  return DOCUMENT_KINDS.map((kind) =>
    guarded(`GET /api/documents/${kind}/<random uuid> without auth serves no PDF`, async () => {
      const response = await probe.request(`/api/documents/${kind}/${randomUUID()}`);
      const contentType = response.headers.get('content-type') ?? '';
      const servesPdf = contentType.includes('application/pdf');
      return [
        ...expectStatus(response, REFUSED_OR_UNKNOWN),
        ...(servesPdf ? ['a PDF was served'] : []),
      ];
    }),
  );
}

function exportChecks(probe: Probe): ProbeCheck[] {
  const sameSite = { origin: probe.origin, 'sec-fetch-site': 'same-origin' };
  return EXPORT_KINDS.map((kind) =>
    guarded(`POST and GET /api/export/${kind} without a session are refused`, async () => {
      const create = await probe.request(`/api/export/${kind}`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...sameSite },
        body: '{}',
      });
      const download = await probe.request(`/api/export/${kind}?id=${randomUUID()}`, {
        headers: sameSite,
      });
      return [...expectStatus(create, REFUSED), ...expectStatus(download, REFUSED)];
    }),
  );
}

function uploadChecks(probe: Probe): ProbeCheck[] {
  return Object.entries(UPLOAD_BODIES).map(([path, body]) =>
    guarded(`POST ${path} without a staff session is a 401`, async () => {
      const response = await probe.request(path, {
        method: 'POST',
        headers: { ...JSON_HEADERS, origin: probe.origin },
        body: JSON.stringify(body()),
      });
      return expectStatus(response, [HTTP.unauthorized]);
    }),
  );
}

function guestPageChecks(probe: Probe): ProbeCheck[] {
  const code = randomBookingCode();
  const bookingPaths = [
    `/reservasi/${code}`,
    `/reservasi/${code}/bayar`,
    `/reservasi/${code}/tiket`,
  ];
  return [
    ...bookingPaths.map((path) =>
      guarded(`GET ${path.replace(code, '<random code>')} is a 404 with no data`, async () => {
        const response = await probe.request(path);
        const body = (await response.text()).replaceAll(code, '');
        return [...expectStatus(response, [HTTP.notFound]), ...piiProblems(body)];
      }),
    ),
    guarded('GET /v/<garbage token> shows invalid and no PII', async () => {
      const response = await probe.request(`/v/GSK.k9.${randomHexToken()}`);
      const body = await response.text();
      const showsInvalid = response.status === HTTP.notFound || body.includes(TICKET_INVALID_TEXT);
      return [
        ...expectStatus(response, [HTTP.ok, HTTP.notFound]),
        ...(showsInvalid ? [] : ['the page does not say the ticket is invalid']),
        ...piiProblems(body),
      ];
    }),
  ];
}

function scannerCheck(probe: Probe): ProbeCheck {
  const scan = JSON.stringify({
    token: 'GSK.k9.tidak-ada',
    attemptId: randomUUID(),
    mode: 'preview',
  });
  const verify = (origin: string) =>
    probe.request('/api/tickets/verify', {
      method: 'POST',
      headers: { ...JSON_HEADERS, origin },
      body: scan,
    });
  return guarded('POST /api/tickets/verify without a session is refused', async () => [
    ...expectStatus(await verify(probe.origin), [HTTP.unauthorized]),
    ...expectStatus(await verify(FOREIGN_ORIGIN), [HTTP.forbidden]),
  ]);
}

// Next.js refuses a Server Action whose Origin is not the site's own (docs/Security.md APP-12).
function serverActionCheck(probe: Probe): ProbeCheck {
  const action = { 'next-action': UNKNOWN_ACTION_ID, 'content-type': 'text/plain;charset=UTF-8' };
  const post = (headers: Record<string, string>) =>
    probe.request('/login', { method: 'POST', headers, body: '[]' });
  return guarded('a Server Action POST from another origin, or with none, is a 403', async () => [
    ...expectStatus(await post({ ...action, origin: FOREIGN_ORIGIN }), [HTTP.forbidden]),
    ...expectStatus(await post(action), [HTTP.forbidden]),
  ]);
}

export function accessChecks(probe: Probe): ProbeCheck[] {
  return [
    ...dashboardChecks(probe),
    ...jobChecks(probe),
    ...webhookChecks(probe),
    ...documentChecks(probe),
    ...exportChecks(probe),
    ...uploadChecks(probe),
    ...guestPageChecks(probe),
    scannerCheck(probe),
    serverActionCheck(probe),
  ];
}

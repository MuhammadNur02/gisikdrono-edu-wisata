import { test, type Page, type Route } from '@playwright/test';
import QRCode from 'qrcode';
import { z } from 'zod';

import { createRwAdmin, removeAccounts, resetAuthLimits } from './staff';
import { ZXING_WASM_PATH } from '../../../src/config/scanner';


// The scanner specs (Task P4.4.05) answer POST /api/tickets/verify themselves until the route of Task P4.4.02 exists,
// after the DB lane's validate_ticket and check_in_ticket; the page, the camera, the result sheet and the requests it
// sends are real.

export const SCANNER = '/dashboard/scanner';
const VERIFY_ROUTE = '**/api/tickets/verify';
const LINE_BREAK = '\n';

// What the page posted, read the way the route will read it (src/lib/validations/scanner.ts).
export const sentScanSchema = z.object({
  attemptId: z.string(),
  mode: z.enum(['preview', 'commit']),
  token: z.string().optional(),
  bookingCode: z.string().optional(),
  attendeeCount: z.number().optional(),
});
export type SentScan = z.infer<typeof sentScanSchema>;

const TICKET = {
  ticketCode: 'GSK-7F3K9Q2M-05',
  institutionName: 'SD Negeri Gisikdrono 01',
  picFirstName: 'Siti',
  packageName: 'Eduwisata Ecowastreme',
  visitDate: '2026-10-24',
  sessionStart: '09:00:00',
  sessionEnd: '11:00:00',
  paxCount: 30,
  participantCount: 28,
  addons: [],
};

function answerOf(scan: SentScan, result: string) {
  const isCommit = scan.mode === 'commit' && result === 'ok';
  return {
    result,
    mode: scan.mode,
    attemptId: scan.attemptId,
    ticket: result === 'not_found' ? null : TICKET,
    usedAt: result === 'already_used' ? '2026-10-24T09:05:00+07:00' : null,
    usedBy: result === 'already_used' ? 'Budi' : null,
    checkedInPax: isCommit ? (scan.attendeeCount ?? null) : null,
    unpaidPax: isCommit ? Math.max(0, (scan.attendeeCount ?? 0) - TICKET.paxCount) : null,
  };
}

// Answers every scan with the result `resultFor` picks, and keeps what the page sent.
export async function answerScans(
  page: Page,
  resultFor: (scan: SentScan, index: number) => string,
) {
  const sent: SentScan[] = [];
  await page.route(VERIFY_ROUTE, async (route: Route) => {
    const scan = sentScanSchema.parse(route.request().postDataJSON());
    sent.push(scan);
    await route.fulfill({ json: answerOf(scan, resultFor(scan, sent.length - 1)) });
  });
  return sent;
}

// Every scan fails as if the phone had no signal; the attempt ids the page sent are kept.
export async function dropScans(page: Page): Promise<string[]> {
  const attempts: string[] = [];
  await page.route(VERIFY_ROUTE, async (route) => {
    attempts.push(sentScanSchema.parse(route.request().postDataJSON()).attemptId);
    await route.abort('internetdisconnected');
  });
  return attempts;
}

interface QrMatrix {
  size: number;
  dark: boolean[];
}

function qrMatrixOf(text: string): QrMatrix {
  const { modules } = QRCode.create(`http://127.0.0.1:3000/v/${text}`, {
    errorCorrectionLevel: 'M',
  });
  const dark: boolean[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1)
      dark.push(modules.get(row, column) === 1);
  }
  return { size: modules.size, dark };
}

// The rear camera, replaced before any page script runs: getUserMedia answers with a canvas stream that shows the
// ticket's QR, drawn module by module (no image, so the CSP's img-src is not involved). Headless Chromium in CI has
// no camera, and its fake-device flags proved unreliable; the page, the reader and the ZXing fallback stay real.
export async function showQrToCamera(page: Page, text: string): Promise<void> {
  await page.addInitScript((matrix: QrMatrix) => {
    const width = 640;
    const height = 480;
    const scale = Math.floor(360 / (matrix.size + 8));
    const left = Math.floor((width - matrix.size * scale) / 2);
    const top = Math.floor((height - matrix.size * scale) / 2);
    navigator.mediaDevices.getUserMedia = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return Promise.reject(new Error('no 2d context'));
      const draw = () => {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#000000';
        matrix.dark.forEach((isDark, index) => {
          if (!isDark) return;
          const row = Math.floor(index / matrix.size);
          const column = index % matrix.size;
          context.fillRect(left + column * scale, top + row * scale, scale, scale);
        });
      };
      draw();
      // A canvas stream only sends a frame when the canvas changes, so it is redrawn as a camera would.
      setInterval(draw, 100);
      return Promise.resolve(canvas.captureStream(10));
    };
  }, qrMatrixOf(text));
}

// What a failed camera test leaves in the CI log: the page's console errors and whether the ZXing reader can be
// fetched and compiled under the page's CSP.
export async function cameraDiagnosticsOf(
  page: Page,
  problems: readonly string[],
): Promise<string> {
  const wasm = await page
    .evaluate(async (path) => {
      const response = await fetch(path);
      const type = response.headers.get('content-type');
      try {
        await WebAssembly.compile(await response.arrayBuffer());
        return `${String(response.status)} ${String(type)} compiled`;
      } catch (error) {
        return `${String(response.status)} ${String(type)} ${String(error)}`;
      }
    }, ZXING_WASM_PATH)
    .catch((error: unknown) => String(error));
  const lines = [`wasm: ${wasm}`, ...problems.map((problem) => `console: ${problem}`)];
  return lines.join(LINE_BREAK);
}

// Each test signs in as an RW 05 officer of its own, removed afterwards: the seeded admin_rw 05 is shared with other
// specs running at the same time, whose sign-ins and sign-outs would cross this one's (the race seen in PR #46).
export function ownRwOfficerPerTest(): () => string {
  let officer: { id: string; email: string } | undefined;
  test.beforeAll(async () => {
    await resetAuthLimits();
  });
  test.beforeEach(async () => {
    officer = await createRwAdmin(5);
  });
  test.afterEach(async () => {
    await removeAccounts(officer ? [officer.id] : []);
    officer = undefined;
  });
  return () => {
    if (!officer) throw new Error('The RW officer of this test was not created');
    return officer.email;
  };
}

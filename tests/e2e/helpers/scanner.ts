import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test, type Page, type Route } from '@playwright/test';
import QRCode from 'qrcode';
import { z } from 'zod';

import { createRwAdmin, removeAccounts, resetAuthLimits } from './staff';

// The scanner specs (Task P4.4.05) answer POST /api/tickets/verify themselves until the route of Task P4.4.02 exists,
// after the DB lane's validate_ticket and check_in_ticket; the page, the camera, the result sheet and the requests it
// sends are real.

export const SCANNER = '/dashboard/scanner';
const VERIFY_ROUTE = '**/api/tickets/verify';

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

// A 640×480 Y4M still of the ticket's QR, which Chromium plays as the camera.
export function fakeCameraWith(text: string): string {
  const width = 640;
  const height = 480;
  const { modules } = QRCode.create(`http://127.0.0.1:3000/v/${text}`, {
    errorCorrectionLevel: 'M',
  });
  const scale = Math.floor(360 / (modules.size + 8));
  const offsetX = Math.floor((width - modules.size * scale) / 2);
  const offsetY = Math.floor((height - modules.size * scale) / 2);
  const luma = Buffer.alloc(width * height, 235);
  for (let y = 0; y < modules.size * scale; y += 1) {
    for (let x = 0; x < modules.size * scale; x += 1) {
      if (modules.get(Math.floor(y / scale), Math.floor(x / scale))) {
        luma[(offsetY + y) * width + offsetX + x] = 16;
      }
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const header = Buffer.from(`YUV4MPEG2 W${String(width)} H${String(height)} F10:1 Ip A1:1 C420\n`);
  const file = join(tmpdir(), 'gisikdrono-scanner-camera.y4m');
  writeFileSync(file, Buffer.concat([header, Buffer.from('FRAME\n'), luma, chroma]));
  return file;
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

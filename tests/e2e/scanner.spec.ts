import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';
import QRCode from 'qrcode';
import { z } from 'zod';

import { fakeTicketToken } from '../fixtures/ticket-token';
import {
  ADMIN_RW05,
  hasHorizontalScroll,
  resetAuthLimits,
  signInToDashboard,
} from './helpers/staff';

// Task P4.4.05 (docs/PRD.md FR-SCAN-02..07, docs/StyleGuide.md §6.6): the scanner front end against the contract of
// POST /api/tickets/verify. The route itself is Task P4.4.02, after the DB lane's validate_ticket and check_in_ticket,
// so this run answers it here; the page, the camera, the result sheet and the requests it sends are real.

const SCANNER = '/dashboard/scanner';
const VERIFY_ROUTE = '**/api/tickets/verify';
const TOKEN = fakeTicketToken();

// What the page posted, read the way the route will read it (src/lib/validations/scanner.ts).
const sentScanSchema = z.object({
  attemptId: z.string(),
  mode: z.enum(['preview', 'commit']),
  token: z.string().optional(),
  bookingCode: z.string().optional(),
  attendeeCount: z.number().optional(),
});
type SentScan = z.infer<typeof sentScanSchema>;

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
async function answerScans(page: Page, resultFor: (scan: SentScan, index: number) => string) {
  const sent: SentScan[] = [];
  await page.route(VERIFY_ROUTE, async (route: Route) => {
    const scan = sentScanSchema.parse(route.request().postDataJSON());
    sent.push(scan);
    await route.fulfill({ json: answerOf(scan, resultFor(scan, sent.length - 1)) });
  });
  return sent;
}

async function checkManually(page: Page) {
  await page.getByRole('tab', { name: 'Kode manual' }).click();
  await page.getByLabel('Kode pemesanan').fill('gsk 7f3k-9q2m');
  await page.getByLabel('4 digit terakhir nomor WhatsApp').fill('4321');
  await page.getByRole('button', { name: 'Periksa' }).click();
}

test.beforeAll(async () => {
  await resetAuthLimits();
});

test('an RW officer checks a group in by its code, with one person more than booked', async ({
  page,
}) => {
  await signInToDashboard(page, ADMIN_RW05);
  const response = await page.goto(SCANNER);
  expect(response?.headers()['permissions-policy']).toContain('camera=(self)');
  expect(await hasHorizontalScroll(page)).toBe(false);
  const sent = await answerScans(page, () => 'ok');

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket valid');
  await expect(sheet).toContainText('SD Negeri Gisikdrono 01');
  await sheet.getByRole('button', { name: 'Tambah satu' }).click();
  await expect(sheet).toContainText('Kelebihan 1 orang dicatat sebagai belum dibayar.');
  await sheet.getByRole('button', { name: 'Konfirmasi Check-in' }).click();
  await expect(sheet.getByRole('alert')).toContainText(
    'Check-in berhasil: SD Negeri Gisikdrono 01 · 31 orang',
  );

  expect(sent.map((scan) => scan.mode)).toEqual(['preview', 'commit']);
  expect(sent[0]?.bookingCode).toBe('GSK-7F3K9Q2M');
  expect(sent[1]?.attemptId).toBe(sent[0]?.attemptId);
  expect(sent[1]?.attendeeCount).toBe(31);
  await sheet.getByRole('button', { name: 'Tutup' }).click();
  const recent = page.getByRole('region', { name: 'Pemindaian terakhir' });
  await expect(recent.getByText('Tiket valid')).toBeVisible();
});

test('a second scan of a used ticket and a ticket of another RW only offer Tutup', async ({
  page,
}) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto(SCANNER);
  await answerScans(page, (_scan, index) => (index === 0 ? 'already_used' : 'wrong_rw'));

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tiket sudah dipakai');
  await expect(sheet).toContainText('oleh Budi');
  await expect(sheet.getByRole('button', { name: 'Konfirmasi Check-in' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Tutup' }).click();

  await page.getByRole('button', { name: 'Periksa' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tiket untuk RW lain');
  await expect(sheet.getByRole('button', { name: 'Override' })).toHaveCount(0);
});

test('without a network the officer is told so, and Coba lagi sends the same attempt', async ({
  page,
}) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto(SCANNER);
  const attempts: string[] = [];
  await page.route(VERIFY_ROUTE, async (route) => {
    attempts.push(sentScanSchema.parse(route.request().postDataJSON()).attemptId);
    await route.abort('internetdisconnected');
  });

  await checkManually(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('alert')).toContainText('Tidak ada sinyal — coba lagi.');
  await sheet.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Tidak ada sinyal');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
});

// A 640×480 Y4M still of the ticket's QR, which Chromium plays as the camera.
function fakeCameraWith(text: string): string {
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

test.describe('the live camera', () => {
  test.use({
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${fakeCameraWith(TOKEN)}`,
      ],
    },
  });

  test('reads a ticket only after a tap on Scan, and sends just its token', async ({ page }) => {
    await signInToDashboard(page, ADMIN_RW05);
    await page.goto(SCANNER);
    const sent = await answerScans(page, () => 'ok');

    await page.getByRole('button', { name: 'Nyalakan kamera' }).click();
    await expect(page.locator('video')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(sent).toHaveLength(0);

    await page.getByRole('button', { name: 'Scan', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Tiket valid', {
      timeout: 15_000,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ mode: 'preview', token: TOKEN });
  });
});

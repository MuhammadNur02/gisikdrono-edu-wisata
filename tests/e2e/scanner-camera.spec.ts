import { expect, test } from '@playwright/test';

import { fakeTicketToken } from '../fixtures/ticket-token';
import { answerScans, ownRwOfficerPerTest, fakeCameraWith, SCANNER } from './helpers/scanner';
import { signInToDashboard } from './helpers/staff';

// Task P4.4.05 (docs/PRD.md FR-SCAN-02, FR-SCAN-06): the live camera, with Chromium playing a still of a synthetic
// ticket QR as the rear camera. The launch flags need a browser of their own, so this file sets them for all of it.
const TOKEN = fakeTicketToken();

test.use({
  // Requests a service worker makes are out of page.route's reach, so the scanner's worker stays off here.
  serviceWorkers: 'block',
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${fakeCameraWith(TOKEN)}`,
    ],
  },
});

const officerEmail = ownRwOfficerPerTest();

test('the live camera reads a ticket only after a tap on Scan, and sends just its token', async ({
  page,
}) => {
  // Whatever keeps the camera or the ZXing reader from starting shows up here: a CSP violation, a refused stream.
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await signInToDashboard(page, officerEmail());
  const response = await page.goto(SCANNER);
  const headers = response?.headers() ?? {};
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
  const sent = await answerScans(page, () => 'ok');

  await page.getByRole('button', { name: 'Nyalakan kamera' }).click();
  await expect(page.locator('video')).toBeVisible();
  // The camera runs with the QR in view, but nothing is read before the officer asks for a scan.
  await page.waitForTimeout(1000);
  expect(sent).toHaveLength(0);

  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Tiket valid', {
    timeout: 15_000,
  });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ mode: 'preview', token: TOKEN });
  expect(problems.filter((problem) => /security policy|wasm|getUserMedia/i.test(problem))).toEqual(
    [],
  );
});

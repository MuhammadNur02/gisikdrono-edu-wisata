import { expect, test } from '@playwright/test';

import { fakeTicketToken } from '../fixtures/ticket-token';
import { answerScans, fakeCameraWith, SCANNER } from './helpers/scanner';
import { ADMIN_RW05, resetAuthLimits, signInToDashboard } from './helpers/staff';

// Task P4.4.05 (docs/PRD.md FR-SCAN-02, FR-SCAN-06): the live camera, with Chromium playing a still of a synthetic
// ticket QR as the rear camera. The launch flags need a browser of their own, so this file sets them for all of it.
const TOKEN = fakeTicketToken();

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

test.beforeAll(async () => {
  await resetAuthLimits();
});

test('the live camera reads a ticket only after a tap on Scan, and sends just its token', async ({
  page,
}) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto(SCANNER);
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
});

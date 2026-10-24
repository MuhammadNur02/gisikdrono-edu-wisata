import { expect, test } from '@playwright/test';

import { fakeTicketToken } from '../fixtures/ticket-token';
import {
  answerScans,
  cameraDiagnosticsOf,
  ownRwOfficerPerTest,
  SCANNER,
  showQrToCamera,
} from './helpers/scanner';
import { signInToDashboard } from './helpers/staff';

// Task P4.4.05 (docs/PRD.md FR-SCAN-02, FR-SCAN-06): the live camera, with getUserMedia answering a canvas stream of a
// synthetic ticket QR (tests/e2e/helpers/scanner.ts); the reader and its self-hosted ZXing fallback are the real ones.
const TOKEN = fakeTicketToken();

// Requests a service worker makes are out of page.route's reach, so the scanner's worker stays off here.
test.use({ serviceWorkers: 'block', permissions: ['camera'] });

const officerEmail = ownRwOfficerPerTest();
// Whatever keeps the camera or the ZXing reader from starting shows up here: a CSP violation, a refused stream.
const problems: string[] = [];

test.beforeEach(({ page }) => {
  problems.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const diagnostics = await cameraDiagnosticsOf(page, problems);
  await testInfo.attach('camera diagnostics', { body: diagnostics, contentType: 'text/plain' });
  // The CI log is where a failed camera run is read; the report is not uploaded.
  process.stdout.write(`[${testInfo.project.name}] camera diagnostics\n${diagnostics}\n`);
});

test('the live camera reads a ticket only after a tap on Scan, and sends just its token', async ({
  page,
}) => {
  await showQrToCamera(page, TOKEN);
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

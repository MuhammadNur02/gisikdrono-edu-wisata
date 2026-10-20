import { expect, test, type Page } from '@playwright/test';

import {
  publicMediaUrl,
  readBookletPdfPath,
  removeArticlesTitled,
  removeBookletsTitled,
} from './helpers/content';
import {
  ADMIN_RW05,
  AUTH_STEP,
  resetAuthLimits,
  signInToDashboard,
  SUPERADMIN,
} from './helpers/staff';
import { cleanBookletPdf } from '../fixtures/pdf';

// Task P2.9.06: what staff save in the CMS is on the public site at the very next visit, because every action
// revalidates the tag its public read is cached under (src/lib/queries/tags.ts). Real pages against the local stack
// of pnpm db:seed, on a production build in CI; the flows run once, on the desktop project.

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const TITLE_PREFIX = 'Booklet uji e2e';
const BOOKLET_TITLE = `${TITLE_PREFIX} ${Date.now().toString(36)}`;
const ARTICLE_PREFIX = 'Artikel uji e2e';
const ARTICLE_TITLE = `${ARTICLE_PREFIX} ${Date.now().toString(36)}`;
// Drawing and finalizing each page takes a moment on a laptop's Docker.
const UPLOAD_STEP = { timeout: 90_000 };

test.beforeAll(async () => {
  await resetAuthLimits();
});

test.afterAll(async () => {
  await removeBookletsTitled(TITLE_PREFIX);
  await removeArticlesTitled(ARTICLE_PREFIX);
});

test.skip(({ isMobile }) => isMobile, 'one run of each flow is enough');

async function saveAndWait(page: Page, saved: string) {
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText(saved)).toBeVisible(AUTH_STEP);
}

test('a booklet an RW 05 officer uploads is on /e-booklet at the next visit', async ({ page }) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto('/dashboard/booklets');
  await page.getByRole('button', { name: 'Unggah booklet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Booklet baru' });

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'booklet.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await cleanBookletPdf()),
  });
  await expect(dialog.getByText('PDF dan 2 halamannya sudah terunggah.')).toBeVisible(UPLOAD_STEP);
  await dialog.getByLabel('Judul').fill(BOOKLET_TITLE);
  await saveAndWait(page, `Booklet "${BOOKLET_TITLE}" tersimpan.`);
  // booklets_super_delete (0005): the RW officer is offered no way to remove it.
  const row = page.getByRole('row', { name: new RegExp(BOOKLET_TITLE) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Hapus' })).toHaveCount(0);

  await page.goto('/e-booklet');
  await expect(page.getByText(BOOKLET_TITLE)).toBeVisible();
});

test('the superadmin removes the booklet, which takes it and its PDF off the site', async ({
  page,
}) => {
  const pdfUrl = publicMediaUrl(await readBookletPdfPath(BOOKLET_TITLE));
  expect((await page.request.get(pdfUrl)).status()).toBe(200);

  await signInToDashboard(page, SUPERADMIN);
  await page.goto('/dashboard/booklets');
  const row = page.getByRole('row', { name: new RegExp(BOOKLET_TITLE) });
  await row.getByRole('button', { name: 'Hapus' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText(`Booklet "${BOOKLET_TITLE}" dihapus.`)).toBeVisible(AUTH_STEP);

  await page.goto('/e-booklet');
  await expect(page.getByText(BOOKLET_TITLE)).toHaveCount(0);
  expect((await page.request.get(pdfUrl)).status()).not.toBe(200);
});

test('an RW page tagline is on the public RW page at the next visit', async ({ page }) => {
  const tagline = `Tagline uji e2e ${Date.now().toString(36)}`;
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto('/dashboard/pages');
  const field = page.getByLabel('Tagline');
  const original = await field.inputValue();

  await field.fill(tagline);
  await saveAndWait(page, 'Halaman RW tersimpan.');
  await page.goto('/rw-05-ecowastreme');
  await expect(page.getByText(tagline).first()).toBeVisible();

  // Back through the form, so the cached page is refreshed too.
  await page.goto('/dashboard/pages');
  await page.getByLabel('Tagline').fill(original);
  await saveAndWait(page, 'Halaman RW tersimpan.');
});

// docs/PRD.md FR-ADMIN-11: an RW officer writes and sends for review; the article reaches /artikel only when the
// superadmin publishes it.
test('an article an RW 05 officer sends for review stays off /artikel', async ({ page }) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto('/dashboard/articles/new');
  // A required field's name ends in its hidden "(wajib)", and the search-engine title starts with "Judul" too.
  await page.getByRole('textbox', { name: 'Judul (wajib)', exact: true }).fill(ARTICLE_TITLE);
  await page.getByRole('textbox', { name: 'Isi artikel' }).fill('Bank sampah buka Minggu pagi.');
  await expect(page.getByRole('button', { name: 'Tayangkan' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ajukan untuk ditinjau' }).click();
  await expect(page.getByText(`Artikel "${ARTICLE_TITLE}" tersimpan.`)).toBeVisible(AUTH_STEP);

  await page.goto('/artikel');
  await expect(page.getByText(ARTICLE_TITLE)).toHaveCount(0);
});

test('the superadmin publishes it, and it is on /artikel at the next visit', async ({ page }) => {
  const saved = `Artikel "${ARTICLE_TITLE}" tersimpan.`;
  await signInToDashboard(page, SUPERADMIN);
  await page.goto('/dashboard/articles');
  const row = page.getByRole('row', { name: new RegExp(ARTICLE_TITLE) });
  await row.getByRole('link', { name: 'Ubah' }).click();
  await page.getByRole('button', { name: 'Tayangkan' }).click();
  await expect(page.getByText(saved)).toBeVisible(AUTH_STEP);
  await page.goto('/artikel');
  await expect(page.getByText(ARTICLE_TITLE)).toBeVisible();
});

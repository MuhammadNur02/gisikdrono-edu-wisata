import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  insertRw08Article,
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

// Task P4.3.03: a content row's actions sit in its `Aksi baris …` menu, and archive or removal is confirmed in a
// ResponsiveDialog.
async function chooseRowAction(page: Page, row: Locator, action: string) {
  await row.getByRole('button', { name: /^Aksi baris/ }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

async function confirmRowAction(page: Page, row: Locator, action: string, done: string) {
  await chooseRowAction(page, row, action);
  await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click();
  await expect(page.getByText(done)).toBeVisible(AUTH_STEP);
}

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

  await page.goto('/e-booklet');
  await expect(page.getByText(BOOKLET_TITLE)).toBeVisible();
});

// Task P4.3.03: the officer archives their booklet, which takes it off /e-booklet; once it is archived the step that
// would remove it for good is still not theirs (booklets_super_delete, 0005).
test('the RW 05 officer archives the booklet but is offered no permanent removal', async ({
  page,
}) => {
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto('/dashboard/booklets');
  const row = page.getByRole('row', { name: new RegExp(BOOKLET_TITLE) });
  await confirmRowAction(page, row, 'Arsipkan', 'Konten diarsipkan.');
  await page.goto('/e-booklet');
  await expect(page.getByText(BOOKLET_TITLE)).toHaveCount(0);

  await page.goto('/dashboard/booklets');
  await row.getByRole('button', { name: /^Aksi baris/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Ubah' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Hapus permanen' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

// The archived booklet kept its PDF; only the superadmin removes it for good, PDF and all.
test('the superadmin removes the archived booklet, which takes it and its PDF off the site', async ({
  page,
}) => {
  const pdfUrl = publicMediaUrl(await readBookletPdfPath(BOOKLET_TITLE));
  expect((await page.request.get(pdfUrl)).status()).toBe(200);

  await signInToDashboard(page, SUPERADMIN);
  await page.goto('/dashboard/booklets');
  const row = page.getByRole('row', { name: new RegExp(BOOKLET_TITLE) });
  await confirmRowAction(page, row, 'Hapus permanen', 'Konten dihapus.');
  await expect(row).toHaveCount(0);
  await page.goto('/e-booklet');
  await expect(page.getByText(BOOKLET_TITLE)).toHaveCount(0);
  expect((await page.request.get(pdfUrl)).status()).not.toBe(200);
});

test('an RW page tagline is on the public RW page at the next visit', async ({ page }) => {
  const tagline = `Tagline uji e2e ${Date.now().toString(36)}`;
  await signInToDashboard(page, ADMIN_RW05);
  await page.goto('/dashboard/pages');
  // Task P4.3.03: the officer's one RW page is a row of the list, edited in a sheet that closes on save.
  const row = page.getByRole('row', { name: /RW 05/ });
  await chooseRowAction(page, row, 'Ubah');
  const field = page.getByRole('dialog').getByLabel('Tagline');
  const original = await field.inputValue();

  await field.fill(tagline);
  await saveAndWait(page, 'Halaman RW tersimpan.');
  await page.goto('/rw-05-ecowastreme');
  await expect(page.getByText(tagline).first()).toBeVisible();

  // Back through the form, so the cached page is refreshed too.
  await page.goto('/dashboard/pages');
  await chooseRowAction(page, row, 'Ubah');
  await page.getByRole('dialog').getByLabel('Tagline').fill(original);
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
  await row.getByRole('link', { name: ARTICLE_TITLE }).click();
  await page.getByRole('button', { name: 'Tayangkan' }).click();
  await expect(page.getByText(saved)).toBeVisible(AUTH_STEP);
  await page.goto('/artikel');
  await expect(page.getByText(ARTICLE_TITLE)).toBeVisible();
});

// Decision of 2026-10-21 (review of PR #18): another RW's content reads exactly like content that does not exist,
// with a real 404, since RLS hides the row from the page.
test("an RW 05 officer opening an RW 08 article's edit page gets a 404", async ({ page }) => {
  const id = '00000000-0000-4000-9000-0000000e2e08';
  await insertRw08Article(id, `${ARTICLE_PREFIX} RW 08`);
  await signInToDashboard(page, ADMIN_RW05);
  const response = await page.goto(`/dashboard/articles/${id}/edit`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Artikel RW 08')).toHaveCount(0);
});

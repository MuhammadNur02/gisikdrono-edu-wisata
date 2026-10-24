import { expect, test, type Page } from '@playwright/test';

// The RW area map of /peta-kontak (docs/PRD.md FR-PUB-18), against the production build CI serves from the
// pnpm db:seed stack. The list beside the map is its keyboard and screen-reader path: it must name all 13 RWs of
// the kelurahan's "Peta RW Wilayah Gisikdrono 2024", and every edu-tourism RW must open onto its own page.

const RW_COUNT = 13;
const RW_BUTTON = /^RW \d{2}/;
const RW_PAGE_PATH = /^\/rw-\d{2}-[a-z0-9-]+$/;

// The map's lazy chunk has loaded once Leaflet has drawn its container, so the page has hydrated and the list's
// buttons answer a click.
async function openMapPage(page: Page) {
  await page.goto('/peta-kontak');
  await expect(page.locator('#wilayah .leaflet-container')).toBeVisible();
}

test('the RW list names every RW of the kelurahan map', async ({ page }) => {
  await openMapPage(page);
  const areas = page.locator('#wilayah');
  await expect(areas.getByRole('button', { name: RW_BUTTON })).toHaveCount(RW_COUNT);
});

test('every edu-tourism RW opens its programme and links to its own page', async ({ page }) => {
  await openMapPage(page);
  const eduGroup = page.locator('#wilayah').getByRole('list', { name: 'Kampung eduwisata' });
  const eduButtons = eduGroup.getByRole('button', { name: RW_BUTTON });
  const count = await eduButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const button = eduButtons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const pageLink = eduGroup.getByRole('region').getByRole('link', { name: /^Buka halaman RW/ });
    await expect(pageLink).toHaveAttribute('href', RW_PAGE_PATH);
  }
});

test('the RW 05 link reaches the RW 05 page', async ({ page }) => {
  await openMapPage(page);
  const areas = page.locator('#wilayah');
  await areas.getByRole('button', { name: /^RW 05/ }).click();
  await areas.getByRole('link', { name: /^Buka halaman RW 05/ }).click();
  await expect(page).toHaveURL(/\/rw-05-ecowastreme$/);
  await expect(page.locator('main')).toBeVisible();
});

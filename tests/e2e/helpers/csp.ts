import { expect, type Page } from '@playwright/test';

// docs/Security.md §13.1 #3: the enforced CSP leaves the key routes without a single violation. Two witnesses, both in
// place before the page's first byte: the securitypolicyviolation events the document fires (recorded by an init
// script) and Chromium's console error naming the Content Security Policy. Turnstile and the dashboard's live counters
// keep the network busy, so the page never goes idle; the check waits for the load event and the page's <main>, which
// every layout renders, then a short settle for hydration, the lazy map chunk and the Turnstile frame.

const CSP_SETTLE_MS = 3_000;
const PAGE_READY = { timeout: 30_000 };

declare global {
  interface Window {
    cspViolations?: string[];
  }
}

async function watchCspViolations(page: Page): Promise<string[]> {
  const fromConsole: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) fromConsole.push(message.text());
  });
  await page.addInitScript(() => {
    window.cspViolations = [];
    // Directive, what was blocked and where the blocked call came from, so a failure names its culprit.
    document.addEventListener('securitypolicyviolation', (event) => {
      const source = event.sourceFile
        ? `${event.sourceFile}:${String(event.lineNumber)}`
        : 'unknown';
      window.cspViolations?.push(
        `${event.violatedDirective} blocked ${event.blockedURI || 'inline'} from ${source}`,
      );
    });
  });
  return fromConsole;
}

export async function cspViolationsOn(page: Page, path: string): Promise<string[]> {
  const fromConsole = await watchCspViolations(page);
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.locator('main').first()).toBeVisible(PAGE_READY);
  await page.waitForTimeout(CSP_SETTLE_MS);
  const fromEvents = await page.evaluate(() => window.cspViolations ?? []);
  return [...fromEvents, ...fromConsole];
}

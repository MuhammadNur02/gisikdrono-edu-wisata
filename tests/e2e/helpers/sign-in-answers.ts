import type { Page } from '@playwright/test';

const ENCODING_HEADERS = new Set(['content-encoding', 'content-length']);

// The bodies of the sign-in answers in order, read on their way to the page: the form keeps its last alert when a new
// submit never reaches the action, so only the answers show what the server said each time (RV-L4 of the independent
// review of PR #17). The browser keeps no copy of a streamed Server Action answer to read afterwards.
// A clientIp makes the sign-ins come from that address (x-real-ip, which the local server trusts as Vercel's would),
// on this site's own requests only, so the Turnstile widget's requests are left as they are.
export async function recordSignInAnswers(page: Page, clientIp?: string): Promise<string[]> {
  const answers: string[] = [];
  await page.route('**/login*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const requestHeaders =
      clientIp === undefined ? undefined : { ...route.request().headers(), 'x-real-ip': clientIp };
    const response = await route.fetch({ headers: requestHeaders });
    const body = await response.text();
    answers.push(body);
    // route.fetch hands the body back decoded, so its encoding headers must not go with it.
    const answerHeaders = Object.fromEntries(
      Object.entries(response.headers()).filter(([name]) => !ENCODING_HEADERS.has(name)),
    );
    return route.fulfill({ status: response.status(), headers: answerHeaders, body });
  });
  return answers;
}

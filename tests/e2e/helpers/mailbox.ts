import { z } from 'zod';

import { localStack } from '../../../scripts/local-stack';

// The emails Supabase Auth sent, read from the stack's Mailpit (http://127.0.0.1:54324). A reset email goes out after
// /forgot-password has answered (after()), so the helper waits for it.

const MAIL_WAIT_MS = 20_000;
const MAIL_POLL_MS = 500;
const RECOVERY_LINK = /href="([^"]*\/auth\/callback\?[^"]*token_hash=[^"]*)"/;

const searchSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), Created: z.string() })),
});
const messageSchema = z.object({ HTML: z.string() });

function mailUrl(path: string): string {
  const { mailUrl: base } = localStack();
  if (!base) throw new Error('supabase status names no Mailpit address');
  return `${base}${path}`;
}

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(mailUrl(path));
  if (!response.ok) throw new Error(`Mailpit answered ${String(response.status)} for ${path}`);
  return response.json();
}

async function messageIdsSince(email: string, since: Date): Promise<string[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const { messages } = searchSchema.parse(await readJson(`/api/v1/search?query=${query}`));
  return messages
    .filter((message) => Date.parse(message.Created) >= since.getTime())
    .map((message) => message.ID);
}

// The recovery link of the newest email to this address sent after `since`.
export async function waitForRecoveryLink(email: string, since: Date): Promise<string> {
  const deadline = Date.now() + MAIL_WAIT_MS;
  while (Date.now() < deadline) {
    const [newest] = await messageIdsSince(email, since);
    if (newest) {
      const { HTML } = messageSchema.parse(await readJson(`/api/v1/message/${newest}`));
      const href = RECOVERY_LINK.exec(HTML)?.[1];
      if (!href) throw new Error('the reset email holds no auth/callback link with a token_hash');
      return href.replaceAll('&amp;', '&');
    }
    await new Promise((resolve) => setTimeout(resolve, MAIL_POLL_MS));
  }
  throw new Error(`no reset email reached ${email} within ${String(MAIL_WAIT_MS)} ms`);
}

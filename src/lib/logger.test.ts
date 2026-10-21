import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createLogger,
  createRootLogger,
  hashEmailForLog,
  redactLinkTokens,
  requestIdFrom,
} from '@/lib/logger';

import { bookingRow, participantRows } from '../../tests/fixtures/booking';
import { sandboxEnv } from '../../tests/fixtures/env';

function captureLogLines() {
  const lines: string[] = [];
  const root = createRootLogger({ write: (line: string) => void lines.push(line) });
  return { lines, logger: createLogger('req-123', root) };
}

describe('logger redaction', () => {
  it('never prints the PIC contact details of a real booking row', () => {
    const { lines, logger } = captureLogLines();
    // eslint-disable-next-line local/no-logging-whole-records -- this test logs a whole row on purpose to prove redaction holds
    logger.error('internal_error', { booking: bookingRow, participants: participantRows });

    const output = lines.join('');
    for (const secret of [
      bookingRow.pic_name,
      bookingRow.pic_phone,
      bookingRow.pic_email,
      ...participantRows.map((row) => row.full_name),
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain(bookingRow.booking_code);
  });

  it("never prints an outbox message's params, where an OTP code waits to be sent, or a code hash", () => {
    const { lines, logger } = captureLogLines();

    logger.error('internal_error', {
      notification: { id: 'n-1', template: 'phone_otp', params: { code: '482913' } },
      params: { code: '482913' },
      code_hash: 'a'.repeat(64),
    });
    const output = lines.join('');
    expect(output).not.toContain('482913');
    expect(output).not.toContain('a'.repeat(64));
    expect(output).toContain('phone_otp');
  });

  it('redacts tokens, signatures and payment details at the top level and one level down', () => {
    const { lines, logger } = captureLogLines();
    logger.warn('webhook_signature_invalid', {
      token: 'top-level-token',
      link: { token: 'nested-token' },
      payload: { signature_key: 'sig-value', snap_token: 'snap-value' },
      customer_details: { phone: '+6281234567890' },
      req: { headers: { authorization: 'Bearer abc', cookie: 'bk_GSK=1' } },
    });

    const output = lines.join('');
    for (const secret of [
      'top-level-token',
      'nested-token',
      'sig-value',
      'snap-value',
      'Bearer abc',
      'bk_GSK=1',
      '+6281234567890',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('writes one JSON line with the event, level and request id', () => {
    const { lines, logger } = captureLogLines();
    logger.info('job_run', { job: 'expire-bookings', processed: 3, failed: 0 });

    const entry: unknown = JSON.parse(lines[0] ?? '');
    expect(entry).toMatchObject({
      level: 'info',
      event: 'job_run',
      requestId: 'req-123',
      job: 'expire-bookings',
    });
  });

  it('does not let a field overwrite the event name', () => {
    const { lines, logger } = captureLogLines();
    logger.info('job_run', { event: 'something_else' });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'job_run' });
  });
});

describe('requestIdFrom', () => {
  it('reuses the Vercel request id when there is one', () => {
    expect(requestIdFrom(new Headers({ 'x-vercel-id': 'sin1::abc' }))).toBe('sin1::abc');
  });

  it('falls back to a random uuid', () => {
    expect(requestIdFrom(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('hashEmailForLog', () => {
  it('gives the same short hash for the same address, whatever the case', () => {
    const hash = hashEmailForLog('Siti.Rahmawati@Example.test ');
    expect(hash).toHaveLength(12);
    expect(hash).toBe(hashEmailForLog('siti.rahmawati@example.test'));
  });

  it('is keyed with OTP_PEPPER under its own label, so it cannot be reproduced by hashing guessed addresses', () => {
    const email = 'siti.rahmawati@example.test';
    const keyed = createHmac('sha256', sandboxEnv.OTP_PEPPER)
      .update(`gsk-log-email-v1\n${email}`)
      .digest('hex');
    const unkeyed = createHash('sha256').update(email).digest('hex');

    expect(hashEmailForLog(email)).toBe(keyed.slice(0, 12));
    expect(hashEmailForLog(email)).not.toBe(unkeyed.slice(0, 12));
  });
});

// Review of PR #20 (info): redactLinkTokens existed but no log line went through it.
describe('link tokens in log lines', () => {
  it('hides guest-link and ticket tokens in any string field of a log line, however deep', () => {
    const { lines, logger } = captureLogLines();
    logger.warn('rate_limited', {
      path: '/reservasi/GSK-7F3K9Q2M?t=eyJzIjoibWFuYWdlIn0.c2lnbmF0dXJlLWd1ZXN0',
      nested: { links: ['https://site.test/v/GSK.k1.dGlja2V0LWlk.c2lnLXRpY2tldA'] },
    });

    const output = lines.join('');
    for (const secret of ['eyJzIjoibWFuYWdlIn0', 'c2lnbmF0dXJlLWd1ZXN0', 'dGlja2V0LWlk']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('/reservasi/GSK-7F3K9Q2M?t=[token]');
    expect(output).toContain('https://site.test/v/[token]');
  });

  it('leaves numbers, flags and other fields as they were', () => {
    const { lines, logger } = captureLogLines();
    logger.info('job_run', {
      job: 'process-notifications',
      processed: 3,
      failed: 0,
      dryRun: false,
    });
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      job: 'process-notifications',
      processed: 3,
      failed: 0,
      dryRun: false,
    });
  });
});

describe('redactLinkTokens', () => {
  it('hides ticket and guest-link tokens in URLs', () => {
    expect(redactLinkTokens('https://site.test/v/GSK.k1.abc.def')).toBe(
      'https://site.test/v/[token]',
    );
    expect(redactLinkTokens('/reservasi/GSK-7F3K9Q2M?t=eyJiIjoi.sig&x=1')).toBe(
      '/reservasi/GSK-7F3K9Q2M?t=[token]&x=1',
    );
  });
});

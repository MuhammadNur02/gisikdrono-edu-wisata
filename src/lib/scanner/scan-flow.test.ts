import { describe, expect, it } from 'vitest';

import { DB_ENUMS } from '@/db/enums';
import {
  IDLE,
  commitOf,
  isOverridable,
  requestOf,
  scanReducer,
  toneOf,
  withRecentScan,
  type ScanAttempt,
} from '@/lib/scanner/scan-flow';
import { verifyTicketRequestSchema, manualCheckInRequestSchema } from '@/lib/validations/scanner';
import type { VerifyTicketResponse } from '@/types/scanner';

import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

const TOKEN = fakeTicketToken();
const PREVIEW: ScanAttempt = {
  source: { kind: 'qr', token: TOKEN },
  attemptId: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
  mode: 'preview',
};
const RESPONSE: VerifyTicketResponse = {
  result: 'ok',
  mode: 'preview',
  attemptId: PREVIEW.attemptId,
  ticket: null,
  usedAt: null,
  usedBy: null,
  checkedInPax: null,
  unpaidPax: null,
};

describe('scanReducer', () => {
  it('goes from a sent preview to its result', () => {
    const checking = scanReducer(IDLE, { type: 'sent', attempt: PREVIEW });
    expect(checking).toEqual({ stage: 'checking', attempt: PREVIEW });
    const done = scanReducer(checking, {
      type: 'finished',
      attempt: PREVIEW,
      outcome: { kind: 'answered', response: RESPONSE },
    });
    expect(done).toEqual({ stage: 'result', attempt: PREVIEW, response: RESPONSE });
  });

  it('keeps the attempt of a request without an answer, for a retry with the same attemptId', () => {
    const checking = scanReducer(IDLE, { type: 'sent', attempt: PREVIEW });
    const problem = scanReducer(checking, {
      type: 'finished',
      attempt: PREVIEW,
      outcome: { kind: 'timeout' },
    });
    expect(problem).toEqual({ stage: 'problem', attempt: PREVIEW, outcome: { kind: 'timeout' } });
  });

  it('ignores a late answer to an attempt the officer already left', () => {
    const other = { ...PREVIEW, attemptId: '0192f3a4-5b6c-7d8e-9f01-000000000000' };
    const checking = scanReducer(IDLE, { type: 'sent', attempt: other });
    const late = { type: 'finished', attempt: PREVIEW, outcome: { kind: 'offline' } } as const;
    expect(scanReducer(checking, late)).toBe(checking);
    expect(scanReducer(IDLE, late)).toBe(IDLE);
  });

  it('closes any stage back to idle', () => {
    const checking = scanReducer(IDLE, { type: 'sent', attempt: PREVIEW });

    expect(scanReducer(checking, { type: 'closed' })).toBe(IDLE);
  });
});

describe('requestOf and commitOf', () => {
  it('builds a QR preview the strict request schema accepts', () => {
    const body = requestOf(PREVIEW);
    expect(body).toEqual({ token: TOKEN, attemptId: PREVIEW.attemptId, mode: 'preview' });
    expect(verifyTicketRequestSchema.safeParse(body).success).toBe(true);
  });

  it('commits the same ticket and attempt with the confirmed count and an override reason', () => {
    const commit = commitOf(PREVIEW, 32, 'Rombongan terlambat karena hujan');
    expect(requestOf(commit)).toEqual({
      token: TOKEN,
      attemptId: PREVIEW.attemptId,
      mode: 'commit',
      attendeeCount: 32,
      overrideReason: 'Rombongan terlambat karena hujan',
    });
    expect(commitOf(PREVIEW, 30)).not.toHaveProperty('overrideReason');
  });

  it('builds a manual request the manual schema accepts', () => {
    const manual: ScanAttempt = {
      ...PREVIEW,
      source: { kind: 'manual', bookingCode: 'GSK-7F3K9Q2M', phoneLastDigits: '4321' },
    };
    const body = requestOf(manual);
    expect(body).toEqual({
      bookingCode: 'GSK-7F3K9Q2M',
      phoneLastDigits: '4321',
      attemptId: PREVIEW.attemptId,
      mode: 'preview',
    });
    expect(manualCheckInRequestSchema.safeParse(body).success).toBe(true);
  });
});

describe('toneOf and isOverridable', () => {
  it('gives every scan_result one of the three tones of FR-SCAN-05', () => {
    expect(toneOf('ok')).toBe('success');
    for (const result of ['already_used', 'outside_window', 'wrong_date'] as const) {
      expect(toneOf(result)).toBe('warning');
    }
    const red = DB_ENUMS.scan_result.filter(
      (result) => !['ok', 'already_used', 'outside_window', 'wrong_date'].includes(result),
    );
    for (const result of red) expect(toneOf(result)).toBe('danger');
  });

  it('offers an override for a wrong day or a closed window only', () => {
    const overridable = DB_ENUMS.scan_result.filter(isOverridable);
    expect(overridable).toEqual(['wrong_date', 'outside_window']);
  });
});

describe('withRecentScan', () => {
  it('puts the newest first, lets a commit replace its preview and keeps ten', () => {
    let recent = withRecentScan([], RESPONSE, '2026-10-24T09:00:00+07:00');
    recent = withRecentScan(
      recent,
      { ...RESPONSE, mode: 'commit', checkedInPax: 30 },
      '2026-10-24T09:01:00+07:00',
    );
    expect(recent).toHaveLength(1);
    expect(recent[0]?.mode).toBe('commit');
    for (let index = 0; index < 12; index += 1) {
      const attemptId = `0192f3a4-5b6c-7d8e-9f01-${String(index).padStart(12, '0')}`;
      recent = withRecentScan(recent, { ...RESPONSE, attemptId }, '2026-10-24T09:02:00+07:00');
    }
    expect(recent).toHaveLength(10);
    expect(recent[0]?.attemptId.endsWith('11')).toBe(true);
  });
});

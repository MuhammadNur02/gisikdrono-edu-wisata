import { describe, expect, it } from 'vitest';

import {
  attendeeBoundsOf,
  manualCheckInRequestSchema,
  unpaidAttendeesOf,
  verifyTicketRequestSchema,
  verifyTicketResponseSchema,
} from '@/lib/validations/scanner';

import { fakeTicketToken } from '../../../tests/fixtures/ticket-token';

const TOKEN = fakeTicketToken();
const ATTEMPT_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const REQUEST = { token: TOKEN, attemptId: ATTEMPT_ID, mode: 'preview' };
const MANUAL = {
  bookingCode: 'gsk 7f3k-9q2m',
  phoneLastDigits: '4321',
  attemptId: ATTEMPT_ID,
  mode: 'preview',
};

describe('verifyTicketRequestSchema', () => {
  it('accepts a preview and a commit with a count and an override reason', () => {
    expect(verifyTicketRequestSchema.safeParse(REQUEST).success).toBe(true);
    const commit = { ...REQUEST, mode: 'commit', attendeeCount: 31, overrideReason: 'Terlambat' };
    expect(verifyTicketRequestSchema.parse(commit)).toEqual(commit);
  });

  it('reads the attempt id in lower case, however the PWA spelled it (re-review of PR #54, L(a))', () => {
    expect(
      verifyTicketRequestSchema.parse({ ...REQUEST, attemptId: ATTEMPT_ID.toUpperCase() })
        .attemptId,
    ).toBe(ATTEMPT_ID);
    expect(
      manualCheckInRequestSchema.parse({ ...MANUAL, attemptId: ATTEMPT_ID.toUpperCase() })
        .attemptId,
    ).toBe(ATTEMPT_ID);
  });

  it('is strict and refuses anything but a ticket token', () => {
    expect(verifyTicketRequestSchema.safeParse({ ...REQUEST, ticketId: 'x' }).success).toBe(false);
    expect(
      verifyTicketRequestSchema.safeParse({ ...REQUEST, token: `https://x.example/v/${TOKEN}` })
        .success,
    ).toBe(false);
    expect(verifyTicketRequestSchema.safeParse({ ...REQUEST, attemptId: '1' }).success).toBe(false);
    expect(verifyTicketRequestSchema.safeParse({ ...REQUEST, mode: 'force' }).success).toBe(false);
  });

  it.each([0, -1, 2.5, 10_001])('refuses the attendee count %s', (attendeeCount) => {
    expect(
      verifyTicketRequestSchema.safeParse({ ...REQUEST, mode: 'commit', attendeeCount }).success,
    ).toBe(false);
  });

  it('refuses a blank or over-long override reason', () => {
    expect(verifyTicketRequestSchema.safeParse({ ...REQUEST, overrideReason: '  ' }).success).toBe(
      false,
    );
    const long = 'a'.repeat(201);
    expect(verifyTicketRequestSchema.safeParse({ ...REQUEST, overrideReason: long }).success).toBe(
      false,
    );
  });
});

describe('manualCheckInRequestSchema', () => {
  it('normalises the booking code the officer typed', () => {
    expect(manualCheckInRequestSchema.parse(MANUAL).bookingCode).toBe('GSK-7F3K9Q2M');
  });

  it.each(['432', '43210', 'abcd', ''])('refuses %j as the last four digits', (phoneLastDigits) => {
    expect(manualCheckInRequestSchema.safeParse({ ...MANUAL, phoneLastDigits }).success).toBe(
      false,
    );
  });

  it('refuses an unknown code and extra fields', () => {
    expect(manualCheckInRequestSchema.safeParse({ ...MANUAL, bookingCode: 'ABC' }).success).toBe(
      false,
    );
    expect(manualCheckInRequestSchema.safeParse({ ...MANUAL, phone: '+628123' }).success).toBe(
      false,
    );
  });
});

describe('verifyTicketResponseSchema', () => {
  const RESPONSE = {
    result: 'already_used',
    mode: 'preview',
    attemptId: ATTEMPT_ID,
    ticket: null,
    usedAt: '2026-10-24T09:05:00+07:00',
    usedBy: 'Budi',
    checkedInPax: null,
    unpaidPax: null,
  };

  it('reads an answer and drops fields it does not know', () => {
    expect(verifyTicketResponseSchema.parse({ ...RESPONSE, extra: true })).toEqual(RESPONSE);
  });

  it('refuses a result outside scan_result', () => {
    expect(verifyTicketResponseSchema.safeParse({ ...RESPONSE, result: 'maybe' }).success).toBe(
      false,
    );
  });
});

describe('attendee bounds', () => {
  it('lets in one person up to twice the booking, the rest unpaid', () => {
    expect(attendeeBoundsOf(30)).toEqual({ min: 1, max: 60 });
    expect(unpaidAttendeesOf(34, 30)).toBe(4);
    expect(unpaidAttendeesOf(28, 30)).toBe(0);
  });
});

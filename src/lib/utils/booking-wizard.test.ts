import { describe, expect, it } from 'vitest';

import type { WizardPackage } from '@/types/booking';
import type { AvailableSession, BookableLeg } from '@/types/session';

import {
  bookableDates,
  bookingToSend,
  busyDates,
  dayAvailability,
  emptyDraft,
  firstIncompleteStep,
  isBookingStep,
  namedRows,
  parseDraft,
  readDraft,
  sessionsOn,
  shownContactOf,
  unbookableDatesBetween,
  type BookingDraft,
} from './booking-wizard';

const COMBO: WizardPackage = {
  id: '0192f3a4-5b6c-7d8e-9f01-000000000001',
  slug: 'paket-kombinasi',
  name: 'Paket Kombinasi',
  rws: [
    { id: 5, label: 'RW 05', accentKey: 'leaf' },
    { id: 13, label: 'RW 13', accentKey: 'terracotta' },
  ],
  minPax: 1,
  maxPax: 200,
};
// The form key the wizard drew once for its draft.
const WIZARD_MOUNT = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const SESSION_RW05 = '0192f3a4-5b6c-7d8e-9f01-000000000005';
const SESSION_RW13 = '0192f3a4-5b6c-7d8e-9f01-000000000013';
const SAVED_AT = Date.UTC(2026, 9, 22, 8, 0);
const HOUR_MS = 3_600_000;

const COMPLETE: BookingDraft = {
  ...emptyDraft(COMBO),
  visitDate: '2026-11-12',
  sessionIds: [SESSION_RW05, SESSION_RW13],
  pax: 30,
  bookerType: 'school',
  institutionName: 'SD Negeri Gisikdrono 01',
  picName: 'Ani Lestari',
  picEmail: 'ani@sekolah.sch.id',
  contact: { channel: 'whatsapp', phone: '+6281234567890', email: null, verifiedAt: 1 },
  idempotencyKey: WIZARD_MOUNT,
  savedAt: SAVED_AT,
};

function session(
  id: string,
  rwId: 5 | 13,
  sessionDate: string,
  remaining: number,
  capacity = 40,
): AvailableSession {
  return {
    id,
    rwId,
    sessionDate,
    startTime: '08:30:00',
    endTime: '10:30:00',
    label: 'Sesi Pagi',
    capacity,
    remaining,
  };
}

describe('readDraft', () => {
  it('starts an empty draft with one unchosen session per leg and the smallest group', () => {
    expect(readDraft(null, COMBO, SAVED_AT)).toMatchObject({
      sessionIds: ['', ''],
      pax: 1,
      bookerType: null,
      contact: null,
    });
  });

  it('reads back a draft it wrote', () => {
    expect(readDraft(JSON.stringify(COMPLETE), COMBO, SAVED_AT)).toEqual(COMPLETE);
  });

  // Review of PR #27, L5: a tab left open since the morning starts again, with a new form key.
  it('reads back a draft for two hours after it was last saved, and starts again after', () => {
    const stored = JSON.stringify(COMPLETE);
    expect(readDraft(stored, COMBO, SAVED_AT + 2 * HOUR_MS)).toEqual(COMPLETE);
    expect(readDraft(stored, COMBO, SAVED_AT + 2 * HOUR_MS + 1)).toEqual(emptyDraft(COMBO));
    // The hook removes what parseDraft finds unusable, since it holds the PIC's details (review of PR #27, L5).
    expect(parseDraft(stored, COMBO, SAVED_AT + 2 * HOUR_MS + 1)).toBeNull();
    expect(parseDraft(stored, COMBO, SAVED_AT)).toEqual(COMPLETE);
  });

  it.each([
    ['broken JSON', '{"visitDate":'],
    ['a key it does not know', JSON.stringify({ ...COMPLETE, total: 1 })],
    [
      'a draft of another package shape',
      JSON.stringify({ ...COMPLETE, sessionIds: [SESSION_RW05] }),
    ],
    [
      'a draft that never said when it was saved',
      JSON.stringify({ ...COMPLETE, savedAt: undefined }),
    ],
  ])('starts again over %s', (_case, stored) => {
    expect(readDraft(stored, COMBO, SAVED_AT)).toEqual(emptyDraft(COMBO));
  });
});

describe('firstIncompleteStep', () => {
  it('sends a fresh draft to jadwal and a complete one to ringkasan', () => {
    expect(firstIncompleteStep(emptyDraft(COMBO), COMBO)).toBe('jadwal');
    expect(firstIncompleteStep(COMPLETE, COMBO)).toBe('ringkasan');
  });

  it('holds jadwal until every leg has its session and the group fits the package', () => {
    expect(firstIncompleteStep({ ...COMPLETE, sessionIds: [SESSION_RW05, ''] }, COMBO)).toBe(
      'jadwal',
    );
    expect(firstIncompleteStep({ ...COMPLETE, pax: 201 }, COMBO)).toBe('jadwal');
    expect(firstIncompleteStep({ ...COMPLETE, visitDate: null }, COMBO)).toBe('jadwal');
  });

  it('holds data until the booker is filled in and the contact is proved', () => {
    expect(firstIncompleteStep({ ...COMPLETE, contact: null }, COMBO)).toBe('data');
    expect(firstIncompleteStep({ ...COMPLETE, bookerType: null }, COMBO)).toBe('data');
    expect(
      firstIncompleteStep(
        { ...COMPLETE, participants: [{ fullName: 'Budi Santoso', groupLabel: '5A' }] },
        COMBO,
      ),
    ).toBe('data');
  });

  it('holds tambahan while an add-on is listed twice', () => {
    const twice = [
      { productId: SESSION_RW05, qty: 1 },
      { productId: SESSION_RW05, qty: 2 },
    ];
    expect(firstIncompleteStep({ ...COMPLETE, addons: twice }, COMBO)).toBe('tambahan');
  });
});

describe('namedRows', () => {
  it('drops the rows nobody filled in and keeps every other one', () => {
    expect(
      namedRows([
        { fullName: 'Budi Santoso', groupLabel: '' },
        { fullName: ' ', groupLabel: '  ' },
        { fullName: '', groupLabel: '5A' },
      ]),
    ).toEqual([
      { fullName: 'Budi Santoso', groupLabel: '' },
      { fullName: '', groupLabel: '5A' },
    ]);
  });
});

describe('isBookingStep', () => {
  it('knows the four steps and nothing else', () => {
    expect(['jadwal', 'data', 'tambahan', 'ringkasan'].every(isBookingStep)).toBe(true);
    expect(isBookingStep('bayar')).toBe(false);
    expect(isBookingStep(undefined)).toBe(false);
  });
});

describe('the dates a package can be booked on', () => {
  const legs: BookableLeg[] = [
    {
      rw: COMBO.rws[0] ?? { id: 5, label: 'RW 05', accentKey: null },
      sessions: [
        session('a', 5, '2026-11-12', 40),
        session('b', 5, '2026-11-13', 4),
        session('c', 5, '2026-11-14', 40),
      ],
    },
    {
      rw: COMBO.rws[1] ?? { id: 13, label: 'RW 13', accentKey: null },
      sessions: [session('d', 13, '2026-11-12', 30), session('e', 13, '2026-11-13', 40)],
    },
  ];

  it('opens a day only when every RW has a session on it with room for the group', () => {
    expect(bookableDates(legs, 1)).toEqual(['2026-11-12', '2026-11-13']);
    expect(bookableDates(legs, 10)).toEqual(['2026-11-12']);
    expect(bookableDates([], 1)).toEqual([]);
  });

  it('marks a day whose sessions are at least 80 % reserved', () => {
    const full = [{ ...legs[0], sessions: [session('f', 5, '2026-11-20', 7)] }] as BookableLeg[];
    expect(busyDates(full)).toEqual(['2026-11-20']);
    expect(busyDates(legs)).toEqual([]);
  });

  it('tells each day of the calendar its seats and state', () => {
    const days = dayAvailability(legs, 10);
    expect(days.get('2026-11-12')).toEqual({ seats: 30, state: 'open' });
    expect(days.get('2026-11-13')).toEqual({ seats: 4, state: 'full' });
    expect(days.get('2026-11-14')).toEqual({ seats: 0, state: 'closed' });
    const nearlyFull = [{ ...legs[0], sessions: [session('f', 5, '2026-11-20', 7)] }] as BookableLeg[];
    expect(dayAvailability(nearlyFull, 5).get('2026-11-20')).toEqual({ seats: 7, state: 'busy' });
  });

  it('lists the days in between that cannot be booked', () => {
    expect(
      unbookableDatesBetween('2026-11-11', '2026-11-14', ['2026-11-12', '2026-11-14']),
    ).toEqual(['2026-11-11', '2026-11-13']);
  });

  it('shows the sessions of one RW on the chosen day', () => {
    const [firstLeg] = legs;
    if (!firstLeg) throw new Error('a leg');
    expect(sessionsOn(firstLeg, '2026-11-13').map((each) => each.id)).toEqual(['b']);
  });
});

describe('bookingToSend', () => {
  const summary = { privacyAccepted: true as const, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
  const QUOTE_HASH = 'f'.repeat(64);

  // Review of PR #27, M2: the server records the privacy notice version itself.
  it('sends identifiers, quantities and what was typed, never a price or a privacy notice version', () => {
    const booking = bookingToSend(
      {
        ...COMPLETE,
        addons: [{ productId: SESSION_RW05, qty: 30 }],
        participants: [{ fullName: 'Budi Santoso', groupLabel: '' }],
        guardianConsent: true,
      },
      COMBO,
      summary,
      QUOTE_HASH,
    );
    expect(booking).toEqual({
      packageId: COMBO.id,
      visitSessionIds: [SESSION_RW05, SESSION_RW13],
      visitDate: '2026-11-12',
      pax: 30,
      bookerType: 'school',
      institutionName: 'SD Negeri Gisikdrono 01',
      picName: 'Ani Lestari',
      picEmail: 'ani@sekolah.sch.id',
      notes: '',
      addons: [{ productId: SESSION_RW05, qty: 30, notes: null }],
      participants: [{ fullName: 'Budi Santoso', groupLabel: null, roleLabel: null }],
      guardianConsent: true,
      privacyAccepted: true,
      idempotencyKey: COMPLETE.idempotencyKey,
      quoteHash: QUOTE_HASH,
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    });
  });

  it('names no institution for an individual, whatever was typed before the type changed', () => {
    const individual = { ...COMPLETE, bookerType: 'individual' as const };
    expect(bookingToSend(individual, COMBO, summary, QUOTE_HASH).institutionName).toBeNull();
  });

  it('sends the address an email code proved as the PIC email (P3.5.04 note)', () => {
    const emailProof = {
      ...COMPLETE,
      picEmail: 'typed@contoh.test',
      contact: {
        channel: 'email' as const,
        phone: '+6281234567890',
        email: 'ani@sekolah.sch.id',
        verifiedAt: 1,
      },
    };
    expect(bookingToSend(emailProof, COMBO, summary, QUOTE_HASH).picEmail).toBe(
      'ani@sekolah.sch.id',
    );
  });
});

// Review of PR #27, M1: what the summary shows as verified, for createBookingAction to hold against the cookie.
describe('shownContactOf', () => {
  it('names the contact the draft shows as verified, or none', () => {
    expect(shownContactOf(COMPLETE)).toEqual({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
    });
    expect(shownContactOf({ ...COMPLETE, contact: null })).toBeNull();
  });
});

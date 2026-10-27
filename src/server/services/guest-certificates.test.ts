import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcCheckCertificatePhone, svcLockCertificatePhone } from '@/db/rpc-certificates';
import type { DatabaseClient } from '@/db/rpc-result';
import { isFirstRefusal, refundRateLimits, withinRateLimits } from '@/lib/rate-limit';
import {
  certificateBookingOf,
  standingCertificatesOf,
  type StandingCertificate,
} from '@/server/services/guest-certificate-reads';
import {
  certificatesAvailableUntil,
  loadGuestCertificates,
  phoneStepUpOf,
  stepUpCertificatePhone,
} from '@/server/services/guest-certificates';

vi.mock('server-only', () => ({}));
vi.mock('@/db/rpc-certificates', () => ({
  svcCheckCertificatePhone: vi.fn(),
  svcLockCertificatePhone: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  isFirstRefusal: vi.fn(),
  refundRateLimits: vi.fn(),
  withinRateLimits: vi.fn(),
}));
vi.mock('@/server/services/guest-certificate-reads', () => ({
  certificateBookingOf: vi.fn(),
  standingCertificatesOf: vi.fn(),
}));

// Every read and RPC is a mock, so the client is only passed along.
const adminClient = {} as DatabaseClient;
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const VISIT_END = '2026-10-20';
const WITHIN = '2027-01-18';
const AFTER = '2027-01-19';
const OPEN_BOOKING = { visitDateEnd: VISIT_END, isPhoneProven: true, isPhoneBlocked: false };

function standing(overrides: Partial<StandingCertificate>): StandingCertificate {
  return {
    id: CERTIFICATE_ID,
    kind: 'group',
    certificate_number: 'SERT/GSK/2026/00001',
    institution_name: 'SD Uji',
    recipient_name: 'SD Uji',
    released_at: '2026-10-20T10:00:00Z',
    ...overrides,
  };
}

const ANI = standing({
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000dd',
  kind: 'participant',
  certificate_number: 'SERT/GSK/2026/00002',
  recipient_name: 'Ani',
});
const BUDI = standing({
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000ee',
  kind: 'participant',
  certificate_number: 'SERT/GSK/2026/00003',
  recipient_name: 'Budi',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(certificateBookingOf).mockResolvedValue(OPEN_BOOKING);
  vi.mocked(standingCertificatesOf).mockResolvedValue([standing({}), ANI, BUDI]);
  vi.mocked(withinRateLimits).mockResolvedValue(true);
});

describe('certificatesAvailableUntil', () => {
  it('is 90 days after the last visit day, across a year end', () => {
    expect(certificatesAvailableUntil(VISIT_END)).toBe(WITHIN);
  });
});

describe('phoneStepUpOf', () => {
  it('is open, blocked after the tenth wrong try, or unverified without a WhatsApp code', () => {
    expect(phoneStepUpOf(OPEN_BOOKING)).toBe('open');
    expect(phoneStepUpOf({ ...OPEN_BOOKING, isPhoneBlocked: true })).toBe('blocked');
    expect(phoneStepUpOf({ ...OPEN_BOOKING, isPhoneProven: false, isPhoneBlocked: true })).toBe(
      'unverified',
    );
  });
});

describe('loadGuestCertificates (Task P4.5.03)', () => {
  const request = { bookingId: BOOKING_ID, hasPhoneProof: false, today: WITHIN };

  it('shows the group by its institution, hides the names until the number is proven, and gives each a slot', async () => {
    await expect(loadGuestCertificates(adminClient, request)).resolves.toEqual({
      state: 'ready',
      availableUntil: WITHIN,
      hasPhoneProof: false,
      phoneStepUp: 'open',
      certificates: [
        {
          id: CERTIFICATE_ID,
          kind: 'group',
          number: 'SERT/GSK/2026/00001',
          recipient: 'SD Uji',
          needsPhone: false,
          slot: 'rombongan',
        },
        {
          id: ANI.id,
          kind: 'participant',
          number: 'SERT/GSK/2026/00002',
          recipient: null,
          needsPhone: true,
          slot: 'peserta-1',
        },
        {
          id: BUDI.id,
          kind: 'participant',
          number: 'SERT/GSK/2026/00003',
          recipient: null,
          needsPhone: true,
          slot: 'peserta-2',
        },
      ],
    });
  });

  it('names the participants once the step-up was passed', async () => {
    const view = await loadGuestCertificates(adminClient, { ...request, hasPhoneProof: true });
    expect(view.state === 'ready' && view.certificates.map((row) => row.recipient)).toEqual([
      'SD Uji',
      'Ani',
      'Budi',
    ]);
  });

  it('counts the slots over released certificates only', async () => {
    vi.mocked(standingCertificatesOf).mockResolvedValue([
      standing({}),
      { ...ANI, released_at: null },
      BUDI,
    ]);
    const view = await loadGuestCertificates(adminClient, request);
    expect(view.state === 'ready' && view.certificates.map((row) => row.slot)).toEqual([
      'rombongan',
      'peserta-1',
    ]);
  });

  it('offers no named certificate for a number no WhatsApp code proved', async () => {
    vi.mocked(certificateBookingOf).mockResolvedValue({ ...OPEN_BOOKING, isPhoneProven: false });
    vi.mocked(standingCertificatesOf).mockResolvedValue([
      standing({ institution_name: null }),
      ANI,
    ]);
    const view = await loadGuestCertificates(adminClient, { ...request, hasPhoneProof: true });
    expect(view).toMatchObject({
      state: 'ready',
      certificates: [],
      hasPhoneProof: false,
      phoneStepUp: 'unverified',
    });
  });

  it('keeps the names hidden once the step-up is blocked for good, whatever the cookie says (L1)', async () => {
    vi.mocked(certificateBookingOf).mockResolvedValue({ ...OPEN_BOOKING, isPhoneBlocked: true });
    const view = await loadGuestCertificates(adminClient, { ...request, hasPhoneProof: true });
    expect(view).toMatchObject({ state: 'ready', hasPhoneProof: false, phoneStepUp: 'blocked' });
    expect(view.state === 'ready' && view.certificates.map((row) => row.recipient)).toEqual([
      'SD Uji',
      null,
      null,
    ]);
  });

  it('is expired after the 90 days, pending with no certificate, held while none is released', async () => {
    await expect(loadGuestCertificates(adminClient, { ...request, today: AFTER })).resolves.toEqual(
      { state: 'expired', availableUntil: WITHIN },
    );
    vi.mocked(standingCertificatesOf).mockResolvedValue([]);
    await expect(loadGuestCertificates(adminClient, request)).resolves.toMatchObject({
      state: 'pending',
    });
    vi.mocked(standingCertificatesOf).mockResolvedValue([standing({ released_at: null })]);
    await expect(loadGuestCertificates(adminClient, request)).resolves.toMatchObject({
      state: 'held',
    });
  });
});

describe('stepUpCertificatePhone (docs/Security.md DOC-02; review of PR #94, M3, L1)', () => {
  const check = {
    bookingId: BOOKING_ID,
    lastFour: '5678',
    ipBucket: '203.0.113.7',
    ipHash: 'a'.repeat(64),
  };
  const perIp = { name: 'certificate_phone:ip', subject: '203.0.113.7' };
  const perBooking = { name: 'certificate_phone:booking', subject: BOOKING_ID };

  it('asks the database within the tries, and gives a right try back', async () => {
    vi.mocked(svcCheckCertificatePhone).mockResolvedValue('verified');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('verified');
    expect(svcCheckCertificatePhone).toHaveBeenCalledWith(adminClient, check);
    expect(refundRateLimits).toHaveBeenCalledWith(adminClient, [perIp, perBooking]);
  });

  it('keeps a wrong try counted, and passes blocked on', async () => {
    vi.mocked(svcCheckCertificatePhone).mockResolvedValueOnce('mismatch');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('mismatch');
    vi.mocked(svcCheckCertificatePhone).mockResolvedValueOnce('blocked');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('blocked');
    expect(refundRateLimits).not.toHaveBeenCalled();
  });

  it('locks past the IP limit without an alert', async () => {
    vi.mocked(withinRateLimits).mockResolvedValueOnce(false);
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('locked');
    expect(withinRateLimits).toHaveBeenCalledWith(adminClient, [perIp]);
    expect(svcLockCertificatePhone).not.toHaveBeenCalled();
    expect(svcCheckCertificatePhone).not.toHaveBeenCalled();
  });

  it("locks past the booking's five, raising the alert on the first refusal only", async () => {
    vi.mocked(withinRateLimits).mockImplementation((_client, [limit]) =>
      Promise.resolve(limit?.name !== 'certificate_phone:booking'),
    );
    vi.mocked(isFirstRefusal).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('locked');
    await expect(stepUpCertificatePhone(adminClient, check)).resolves.toBe('locked');
    expect(svcLockCertificatePhone).toHaveBeenCalledTimes(1);
    expect(refundRateLimits).toHaveBeenCalledWith(adminClient, [perIp]);
    expect(svcCheckCertificatePhone).not.toHaveBeenCalled();
  });
});

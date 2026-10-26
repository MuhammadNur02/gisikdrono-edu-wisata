import { describe, expect, it } from 'vitest';

import {
  bookingLookupSchema,
  evidenceLinkSchema,
  parseAdjustmentFilter,
  parseDayFilter,
  parseFinancePeriod,
  payoutPreviewSchema,
  proposeAdjustmentSchema,
  rejectAdjustmentSchema,
  releaseKeyMismatchSchema,
  resolveIssueSchema,
  saveRevenueRuleSchema,
  settlePayoutSchema,
  sharesTotalHundredths,
} from './finance';

const TODAY = '2026-10-25';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-000000000001';
const PAYMENT_ID = '0192f3a4-5b6c-7d8e-9f01-000000000002';
const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000003';
const QUARANTINE = 'kelurahan/0192f3a4-5b6c-7d8e-9f01-000000000004';

describe('parseFinancePeriod', () => {
  it('opens on the last 30 days up to today', () => {
    expect(parseFinancePeriod({}, TODAY)).toEqual({
      from: '2026-09-25',
      to: TODAY,
      isInvalid: false,
    });
  });

  it('keeps a period of at most 12 months', () => {
    expect(parseFinancePeriod({ from: '2026-01-01', to: '2026-10-25' }, TODAY)).toEqual({
      from: '2026-01-01',
      to: '2026-10-25',
      isInvalid: false,
    });
  });

  it.each([
    [{ from: '2026-10-25', to: '2026-10-01' }],
    [{ from: '2025-01-01', to: '2026-10-25' }],
    [{ from: 'kemarin', to: TODAY }],
    [{ from: '2026-10-01' }],
  ])('falls back to the default and says so for %o', (params) => {
    expect(parseFinancePeriod(params, TODAY)).toMatchObject({
      from: '2026-09-25',
      isInvalid: true,
    });
  });
});

const RULE = {
  scope: 'package' as const,
  rwId: null,
  packageId: PACKAGE_ID,
  productId: null,
  name: 'Paket sekolah 2027',
  effectiveFrom: '2026-11-01',
  lines: [
    { beneficiary: 'kelurahan' as const, rwId: null, vendorId: null, pct: 33.33 },
    { beneficiary: 'rw_treasury' as const, rwId: 5, vendorId: null, pct: 66.67 },
  ],
};

describe('saveRevenueRuleSchema', () => {
  it('accepts shares of two decimals adding up to 100', () => {
    expect(saveRevenueRuleSchema.safeParse(RULE).success).toBe(true);
    expect(sharesTotalHundredths(RULE.lines)).toBe(10_000);
  });

  it('refuses shares that do not add up to 100, or with three decimals', () => {
    const short = { ...RULE, lines: [{ ...RULE.lines[0], pct: 30 }] };
    const precise = {
      ...RULE,
      lines: [
        { ...RULE.lines[0], pct: 33.333 },
        { ...RULE.lines[1], pct: 66.667 },
      ],
    };
    expect(saveRevenueRuleSchema.safeParse(short).success).toBe(false);
    expect(saveRevenueRuleSchema.safeParse(precise).success).toBe(false);
  });

  it('wants the package of a package rule, and no field it does not know', () => {
    expect(saveRevenueRuleSchema.safeParse({ ...RULE, packageId: null }).success).toBe(false);
    expect(saveRevenueRuleSchema.safeParse({ ...RULE, total: 100 }).success).toBe(false);
  });
});

const PAYOUT = {
  beneficiaryKey: 'rw:5',
  from: '2026-10-01',
  to: '2026-10-24',
  reference: 'TRF-RW5-001',
  accountDigits: '1234',
  proofUpload: QUARANTINE,
  expectedTotal: 70000,
};

describe('settlePayoutSchema', () => {
  it('accepts a payout to a known beneficiary', () => {
    expect(settlePayoutSchema.safeParse(PAYOUT).success).toBe(true);
  });

  it.each([
    [{ beneficiaryKey: 'pak-rt' }],
    [{ accountDigits: '12a4' }],
    [{ reference: 'ab' }],
    [{ from: '2026-10-24', to: '2026-10-01' }],
    [{ amount: 1000 }],
    [{ expectedTotal: 0 }],
    [{ expectedTotal: 10.5 }],
    [{ to: '2999-01-01' }],
  ])('refuses %o', (change) => {
    expect(settlePayoutSchema.safeParse({ ...PAYOUT, ...change }).success).toBe(false);
  });
});

const PROPOSAL = {
  type: 'manual_refund' as const,
  bookingId: BOOKING_ID,
  paymentId: PAYMENT_ID,
  amount: 50_000,
  reason: 'Biaya tambahan dikembalikan',
  lineRef: null,
  fromKey: null,
  toKey: null,
  weatherLinkId: null,
  evidenceUpload: QUARANTINE,
};

describe('proposeAdjustmentSchema', () => {
  it('accepts a manual refund of a payment', () => {
    expect(proposeAdjustmentSchema.safeParse(PROPOSAL).success).toBe(true);
  });

  it('wants the payment of a manual refund and a whole positive rupiah amount', () => {
    expect(proposeAdjustmentSchema.safeParse({ ...PROPOSAL, paymentId: null }).success).toBe(false);
    expect(proposeAdjustmentSchema.safeParse({ ...PROPOSAL, amount: 0 }).success).toBe(false);
    expect(proposeAdjustmentSchema.safeParse({ ...PROPOSAL, amount: 10.5 }).success).toBe(false);
  });

  it('wants a line and two different parties for a move', () => {
    const move = {
      ...PROPOSAL,
      type: 'reclassify_share' as const,
      paymentId: null,
      lineRef: 'package',
    };
    expect(
      proposeAdjustmentSchema.safeParse({ ...move, fromKey: 'rw:5', toKey: 'rw:5' }).success,
    ).toBe(false);
    expect(
      proposeAdjustmentSchema.safeParse({ ...move, fromKey: 'rw:5', toKey: 'kelurahan' }).success,
    ).toBe(true);
  });

  it('lets a manual refund alone name the weather link it answers, by its uuid (PR #90)', () => {
    expect(
      proposeAdjustmentSchema.safeParse({ ...PROPOSAL, weatherLinkId: PAYMENT_ID }).success,
    ).toBe(true);
    expect(proposeAdjustmentSchema.safeParse({ ...PROPOSAL, weatherLinkId: 'cuaca' }).success).toBe(
      false,
    );
    const writeOff = {
      ...PROPOSAL,
      type: 'write_off' as const,
      paymentId: null,
      weatherLinkId: PAYMENT_ID,
    };
    expect(proposeAdjustmentSchema.safeParse(writeOff).success).toBe(false);
  });

  it('refuses a reason shorter than ten characters and a type proposed elsewhere', () => {
    expect(proposeAdjustmentSchema.safeParse({ ...PROPOSAL, reason: 'Singkat' }).success).toBe(
      false,
    );
    expect(
      proposeAdjustmentSchema.safeParse({ ...PROPOSAL, type: 'manual_mark_paid' }).success,
    ).toBe(false);
  });
});

describe('the smaller forms', () => {
  it('reads a booking code in any case', () => {
    expect(bookingLookupSchema.parse({ bookingCode: ' gsk-7f3k9q2m ' })).toEqual({
      bookingCode: 'GSK-7F3K9Q2M',
    });
    expect(bookingLookupSchema.safeParse({ bookingCode: 'GSK-ILOU0000' }).success).toBe(false);
  });

  it('wants a reason to reject and a note to close an issue', () => {
    expect(
      rejectAdjustmentSchema.safeParse({ adjustmentId: BOOKING_ID, reason: 'Salah' }).success,
    ).toBe(false);
    expect(
      resolveIssueSchema.safeParse({
        issueId: BOOKING_ID,
        resolution: 'ignored',
        note: 'Selisih bank',
      }).success,
    ).toBe(true);
    expect(
      resolveIssueSchema.safeParse({
        issueId: BOOKING_ID,
        resolution: 'later',
        note: 'Selisih bank',
      }).success,
    ).toBe(false);
  });
});

describe('releaseKeyMismatchSchema and evidenceLinkSchema (review of PR #80, L-1, M-3)', () => {
  it('wants a note of at least ten characters to release a block', () => {
    expect(
      releaseKeyMismatchSchema.safeParse({ adjustmentId: BOOKING_ID, note: 'Singkat' }).success,
    ).toBe(false);
    expect(
      releaseKeyMismatchSchema.safeParse({
        adjustmentId: BOOKING_ID,
        note: 'Angka Midtrans sudah dicek',
      }).success,
    ).toBe(true);
  });

  it('opens the evidence of an adjustment or a payout only', () => {
    expect(evidenceLinkSchema.safeParse({ kind: 'payout', id: BOOKING_ID }).success).toBe(true);
    expect(evidenceLinkSchema.safeParse({ kind: 'export', id: BOOKING_ID }).success).toBe(false);
  });
});

describe('payoutPreviewSchema (review of PR #80, M-2)', () => {
  it("leaves the start out for the party's oldest unpaid day", () => {
    expect(
      payoutPreviewSchema.safeParse({ beneficiaryKey: 'rw:5', from: null, to: null }).success,
    ).toBe(true);
    expect(
      payoutPreviewSchema.safeParse({ beneficiaryKey: 'pak-rt', from: null, to: null }).success,
    ).toBe(false);
  });
});

describe('the list filters (review of PR #80, L-5)', () => {
  it('reads a status and two days, and leaves out what the URL got wrong', () => {
    expect(
      parseAdjustmentFilter({ status: 'approved', from: '2026-09-01', to: 'kemarin' }),
    ).toEqual({
      status: 'approved',
      from: '2026-09-01',
      to: null,
    });
    expect(parseAdjustmentFilter({ status: 'lain' }).status).toBeNull();
    expect(parseDayFilter({ from: ['2026-09-01', '2026-09-02'] })).toEqual({
      from: '2026-09-01',
      to: null,
    });
  });
});

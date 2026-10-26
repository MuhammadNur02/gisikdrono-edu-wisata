import { describe, expect, it } from 'vitest';

import type { StaffDsrRequest } from '@/types/dsr';

import { dsrStepsOf } from './dsr-steps';

const REQUEST: StaffDsrRequest = {
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000d5',
  requestType: 'access',
  status: 'received',
  outcome: null,
  message: 'Diminta lewat telepon',
  resolutionNote: null,
  createdAt: '2026-10-26T01:00:00Z',
  verifiedAt: null,
  acknowledgedAt: null,
  dueAt: '2026-10-29T01:00:00Z',
  fulfilDueAt: null,
  handledAt: null,
};
const CONFIRMED = {
  ...REQUEST,
  verifiedAt: '2026-10-26T02:00:00Z',
  fulfilDueAt: '2026-11-09T02:00:00Z',
};
const ACKNOWLEDGED = {
  ...CONFIRMED,
  status: 'in_progress' as const,
  acknowledgedAt: '2026-10-26T03:00:00Z',
};

describe('dsrStepsOf', () => {
  it('only refuses an unconfirmed request for its identity', () => {
    expect(dsrStepsOf(REQUEST, false)).toEqual({
      canAcknowledge: false,
      finishSteps: [],
      closeOutcomes: ['rejected_identity'],
    });
  });

  it('acknowledges a confirmed request first, or refuses it', () => {
    expect(dsrStepsOf(CONFIRMED, false)).toEqual({
      canAcknowledge: true,
      finishSteps: [],
      closeOutcomes: ['rejected_other'],
    });
  });

  it('answers an acknowledged request by its kind', () => {
    expect(dsrStepsOf(ACKNOWLEDGED, false).finishSteps).toEqual(['export']);
    expect(dsrStepsOf({ ...ACKNOWLEDGED, requestType: 'erasure' }, false).finishSteps).toEqual([
      'deleteParticipants',
      'anonymise',
    ]);
    expect(
      dsrStepsOf({ ...ACKNOWLEDGED, requestType: 'withdraw_consent' }, false).finishSteps,
    ).toEqual(['deleteParticipants']);
    expect(dsrStepsOf({ ...ACKNOWLEDGED, requestType: 'rectification' }, false)).toEqual({
      canAcknowledge: false,
      finishSteps: [],
      closeOutcomes: ['rectified', 'rejected_other'],
    });
    expect(
      dsrStepsOf({ ...ACKNOWLEDGED, requestType: 'restriction' }, false).closeOutcomes,
    ).toEqual(['rectified', 'rejected_other']);
  });

  it('does not anonymise a booking twice', () => {
    expect(dsrStepsOf({ ...ACKNOWLEDGED, requestType: 'erasure' }, true).finishSteps).toEqual([
      'deleteParticipants',
    ]);
  });

  it('offers nothing on a finished request', () => {
    const none = { canAcknowledge: false, finishSteps: [], closeOutcomes: [] };
    expect(
      dsrStepsOf({ ...ACKNOWLEDGED, status: 'completed', outcome: 'exported' }, false),
    ).toEqual(none);
    expect(
      dsrStepsOf({ ...REQUEST, status: 'rejected', outcome: 'rejected_identity' }, false),
    ).toEqual(none);
  });
});

import type { DsrCloseOutcome, StaffDsrRequest } from '@/types/dsr';

// The steps the superadmin's queue offers for one request, the same rules the dsr_* RPCs of 20261104140100 check
// (Task P4.10.03): an unconfirmed request can only be refused for its identity; a confirmed one is acknowledged first;
// an acknowledged one is answered by its kind, or refused. The RPCs check all of it again.

export type DsrFinishStep = 'export' | 'deleteParticipants' | 'anonymise';

export interface DsrSteps {
  canAcknowledge: boolean;
  finishSteps: DsrFinishStep[];
  closeOutcomes: DsrCloseOutcome[];
}

const NO_STEPS: DsrSteps = { canAcknowledge: false, finishSteps: [], closeOutcomes: [] };

const FINISH_STEPS_OF: Record<StaffDsrRequest['requestType'], DsrFinishStep[]> = {
  access: ['export'],
  erasure: ['deleteParticipants', 'anonymise'],
  withdraw_consent: ['deleteParticipants'],
  rectification: [],
  restriction: [],
};

const RECTIFIABLE = new Set<StaffDsrRequest['requestType']>(['rectification', 'restriction']);

export function dsrStepsOf(request: StaffDsrRequest, isBookingAnonymised: boolean): DsrSteps {
  if (request.status === 'received') {
    return request.verifiedAt === null
      ? { ...NO_STEPS, closeOutcomes: ['rejected_identity'] }
      : { ...NO_STEPS, canAcknowledge: true, closeOutcomes: ['rejected_other'] };
  }
  if (request.status !== 'in_progress') return NO_STEPS;
  const finishSteps = FINISH_STEPS_OF[request.requestType].filter(
    (step) => !(isBookingAnonymised && step === 'anonymise'),
  );
  const closeOutcomes: DsrCloseOutcome[] = RECTIFIABLE.has(request.requestType)
    ? ['rectified', 'rejected_other']
    : ['rejected_other'];
  return { canAcknowledge: false, finishSteps, closeOutcomes };
}

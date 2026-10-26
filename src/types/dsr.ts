// Data-subject requests (Task P4.10.03; dsr_requests of 20261104140100). The kinds, statuses and outcomes are the
// migration's CHECK lists.
export const DSR_REQUEST_TYPES = [
  'access',
  'rectification',
  'erasure',
  'restriction',
  'withdraw_consent',
] as const;
export type DsrRequestType = (typeof DSR_REQUEST_TYPES)[number];

export const DSR_STATUSES = ['received', 'in_progress', 'completed', 'rejected'] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];

export const DSR_OUTCOMES = [
  'exported',
  'participants_deleted',
  'anonymised',
  'rectified',
  'rejected_identity',
  'rejected_other',
] as const;
export type DsrOutcome = (typeof DSR_OUTCOMES)[number];

// The outcomes dsr_close gives; the others come with their own action.
export const DSR_CLOSE_OUTCOMES = ['rectified', 'rejected_identity', 'rejected_other'] as const;
export type DsrCloseOutcome = (typeof DSR_CLOSE_OUTCOMES)[number];

// One row of the superadmin's queue on /dashboard/bookings/[id]. No contact: the request's number is the booking's
// own, and the export's files never reach the superadmin. ISO strings.
export interface StaffDsrRequest {
  id: string;
  requestType: DsrRequestType;
  status: DsrStatus;
  outcome: DsrOutcome | null;
  message: string | null;
  resolutionNote: string | null;
  createdAt: string;
  verifiedAt: string | null;
  acknowledgedAt: string | null;
  dueAt: string;
  fulfilDueAt: string | null;
  handledAt: string | null;
}

// What the guest's /reservasi/<code>/privasi shows of their own requests.
export interface GuestDsrRequest {
  id: string;
  requestType: DsrRequestType;
  status: DsrStatus;
  outcome: DsrOutcome | null;
  resolutionNote: string | null;
  createdAt: string;
  verifiedAt: string | null;
  fulfilDueAt: string | null;
  hasExport: boolean;
}

export type DsrExportFormat = 'json' | 'pdf';

// What a step of the queue answers: whether the guest's message was queued to their verified number.
export interface DsrStepAnswer {
  isGuestNotified: boolean;
}

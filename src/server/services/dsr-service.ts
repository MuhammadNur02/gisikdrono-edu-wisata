import 'server-only';

import {
  dsrAcknowledge,
  dsrAnonymiseBooking,
  dsrClose,
  dsrDeleteParticipants,
  dsrOpen,
  dsrRecordExport,
  type DsrFinish,
} from '@/db/rpc-dsr';
import { dsrCopy } from '@/lib/copy/dsr';
import { staffCopy } from '@/lib/copy/staff';
import { AppError, privilegeHintOf, raisedHintOf } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CloseDsrValues,
  DsrFinishValues,
  DsrStepValues,
  OpenDsrValues,
} from '@/lib/validations/dsr';
import { discardDsrExport, storeDsrExport } from '@/server/services/document-service';
import {
  DSR_OUTCOMES,
  DSR_REQUEST_TYPES,
  DSR_STATUSES,
  type DsrOutcome,
  type DsrRequestType,
  type DsrStatus,
  type StaffDsrRequest,
} from '@/types/dsr';

// The superadmin's data-request queue on /dashboard/bookings/[id] (Task P4.10.03). Every read and write goes through
// the superadmin's session client: the dsr_* RPCs of 20261104140100 check the role, AAL2 and, for the destructive
// steps, the fresh code. Only the export's files are read and written with the service role, in
// document-service.ts.

const INSUFFICIENT_PRIVILEGE = '42501';
const NO_DATA_FOUND = 'P0002';
const INVALID_PARAMETER = '22023';
const COLUMNS = `id, request_type, status, outcome, message, resolution_note, created_at, verified_at,
  acknowledged_at, due_at, fulfil_due_at, handled_at`;

function codeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

function dsrRefusal(error: unknown): AppError | null {
  const code = codeOf(error);
  if (code === INSUFFICIENT_PRIVILEGE) {
    return new AppError(
      'FORBIDDEN',
      privilegeHintOf(error) === 'FRESH_TOTP' ? staffCopy.notFresh : undefined,
    );
  }
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (raisedHintOf(error) === 'STATE_INVALID') {
    return new AppError('STATE_INVALID', dsrCopy.staff.stateInvalid);
  }
  return null;
}

async function asDsrStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw dsrRefusal(error) ?? error;
  }
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

type DsrRow = {
  id: string;
  request_type: string;
  status: string;
  outcome: string | null;
  message: string | null;
  resolution_note: string | null;
  created_at: string;
  verified_at: string | null;
  acknowledged_at: string | null;
  due_at: string;
  fulfil_due_at: string | null;
  handled_at: string | null;
};

function toStaffDsrRequest(row: DsrRow): StaffDsrRequest | null {
  const requestType: DsrRequestType | null = oneOf(DSR_REQUEST_TYPES, row.request_type);
  const status: DsrStatus | null = oneOf(DSR_STATUSES, row.status);
  if (requestType === null || status === null) return null;
  const outcome: DsrOutcome | null = oneOf(DSR_OUTCOMES, row.outcome);
  return {
    id: row.id,
    requestType,
    status,
    outcome,
    message: row.message,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    acknowledgedAt: row.acknowledged_at,
    dueAt: row.due_at,
    fulfilDueAt: row.fulfil_due_at,
    handledAt: row.handled_at,
  };
}

// The booking's requests, newest first; RLS shows them to the superadmin alone.
export async function listBookingDsrRequests(bookingId: string): Promise<StaffDsrRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('dsr_requests')
    .select(COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toStaffDsrRequest).filter((row): row is StaffDsrRequest => row !== null);
}

export async function openDsrRequest(values: OpenDsrValues): Promise<{ isGuestNotified: boolean }> {
  const supabase = await createSupabaseServerClient();
  const opened = await asDsrStep(() => dsrOpen(supabase, values));
  return { isGuestNotified: opened.isGuestNotified };
}

export async function acknowledgeDsrRequest(values: DsrStepValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asDsrStep(() => dsrAcknowledge(supabase, values.requestId));
}

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// The request as the superadmin reads it under RLS: an acknowledged access request of this very booking, before the
// service role reads the booking for its export.
async function assertExportable(supabase: SessionClient, values: DsrFinishValues): Promise<void> {
  const { data, error } = await supabase
    .from('dsr_requests')
    .select('booking_id, status, request_type, verified_at')
    .eq('id', values.requestId)
    .maybeSingle();
  if (error) throw error;
  if (data === null || data.booking_id !== values.bookingId) throw new AppError('NOT_FOUND');
  if (
    data.status !== 'in_progress' ||
    data.request_type !== 'access' ||
    data.verified_at === null
  ) {
    throw new AppError('STATE_INVALID', dsrCopy.staff.stateInvalid);
  }
}

// The files first, kept with the service role; the record second, which checks the fresh code and the step itself.
// A refused record takes the files out again, so nothing waits in the bucket for a request that was not answered.
export async function exportDsrData(values: DsrFinishValues): Promise<DsrFinish> {
  const supabase = await createSupabaseServerClient();
  await assertExportable(supabase, values);
  const paths = await storeDsrExport(values.bookingId, values.requestId);
  try {
    return await asDsrStep(() =>
      dsrRecordExport(supabase, { requestId: values.requestId, note: values.note, ...paths }),
    );
  } catch (error) {
    await discardDsrExport(paths);
    throw error;
  }
}

export async function deleteDsrParticipants(values: DsrFinishValues): Promise<DsrFinish> {
  const supabase = await createSupabaseServerClient();
  return asDsrStep(() =>
    dsrDeleteParticipants(supabase, { requestId: values.requestId, note: values.note }),
  );
}

export async function anonymiseDsrBooking(values: DsrFinishValues): Promise<DsrFinish> {
  const supabase = await createSupabaseServerClient();
  return asDsrStep(() =>
    dsrAnonymiseBooking(supabase, { requestId: values.requestId, note: values.note }),
  );
}

export async function closeDsrRequest(values: CloseDsrValues): Promise<DsrFinish> {
  const supabase = await createSupabaseServerClient();
  return asDsrStep(() =>
    dsrClose(supabase, { requestId: values.requestId, outcome: values.outcome, note: values.note }),
  );
}

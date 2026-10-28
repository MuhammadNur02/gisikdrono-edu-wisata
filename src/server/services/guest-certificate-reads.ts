import 'server-only';

import { CERTIFICATE_PHONE_FAILURE_CAP, CERTIFICATE_PHONE_TOTAL_FAILURE_CAP } from '@/config/guest';
import type { DatabaseClient } from '@/db/rpc-result';

// The reads behind the visitor's certificate page (Task P4.5.03), on the service-role client document-service.ts
// hands in, by the booking id a verified certificate link gave. Nothing here writes, and the PIC's number is never
// read: only whether a WhatsApp code proved it, and whether the step-up was blocked for good (review of PR #94, L1).

export interface CertificateBooking {
  visitDateEnd: string;
  isPhoneProven: boolean;
  isPhoneBlocked: boolean;
}

export async function certificateBookingOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<CertificateBooking> {
  const { data, error } = await adminClient
    .from('bookings')
    .select(
      'visit_date_end, phone_verified_at, certificate_phone_failures, certificate_phone_failures_in_window',
    )
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return {
    visitDateEnd: data.visit_date_end,
    isPhoneProven: data.phone_verified_at !== null,
    isPhoneBlocked:
      data.certificate_phone_failures >= CERTIFICATE_PHONE_FAILURE_CAP ||
      data.certificate_phone_failures_in_window >= CERTIFICATE_PHONE_TOTAL_FAILURE_CAP,
  };
}

export async function standingCertificatesOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('certificates')
    .select('id, kind, certificate_number, institution_name, recipient_name, released_at')
    .eq('booking_id', bookingId)
    .eq('status', 'issued')
    .is('purged_at', null)
    .order('kind')
    .order('certificate_number');
  if (error) throw error;
  return data;
}

export type StandingCertificate = Awaited<ReturnType<typeof standingCertificatesOf>>[number];

// Every participant certificate the booking was ever issued, in the order it was issued, whatever became of it since:
// the order a download slot counts in (follow-up of the review of PR #94). No certificate row is deleted (the booking
// restricts it, the purge only marks it), and a later one is issued after, so revoking, holding back or purging one
// never moves another's slot onto a different person.
export async function participantCertificateIdsOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<string[]> {
  const { data, error } = await adminClient
    .from('certificates')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('kind', 'participant')
    .order('issued_at')
    .order('certificate_number');
  if (error) throw error;
  return data.map((row) => row.id);
}

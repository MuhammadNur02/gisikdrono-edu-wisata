import 'server-only';

import { CERTIFICATE_PHONE_FAILURE_CAP } from '@/config/guest';
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
    .select('visit_date_end, phone_verified_at, certificate_phone_failures')
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return {
    visitDateEnd: data.visit_date_end,
    isPhoneProven: data.phone_verified_at !== null,
    isPhoneBlocked: data.certificate_phone_failures >= CERTIFICATE_PHONE_FAILURE_CAP,
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

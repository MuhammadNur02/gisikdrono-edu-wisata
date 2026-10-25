'use server';

import { revalidatePath } from 'next/cache';

import { CERTIFICATES_DASHBOARD_PATH } from '@/config/certificates';
import { fail, mapError, ok } from '@/lib/errors';
import {
  certificateBookingSchema,
  revokeCertificateSchema,
  waiveCertificatesSchema,
} from '@/lib/validations/certificate';
import { requireRole } from '@/server/auth/guards';
import {
  assertSeesBookingCertificates,
  issueBookingCertificates,
  revokeOneCertificate,
  waiveCertificateRelease,
} from '@/server/services/certificate-service';
import { rerenderCertificateFiles } from '@/server/services/document-service';
import type { ActionResult } from '@/types/action-result';

// /dashboard/certificates (Task P4.5.03, docs/PRD.md FR-ADMIN-07). Staff work at AAL2 only; issue_certificates and
// revoke_certificate check scope, AAL2 and the superadmin's own steps again in the database. Nothing public changes,
// since /verifikasi reads per request, so only the dashboard list is revalidated.

// Issue what is missing ("Terbitkan ulang"): an officer of one of the booking's RWs, or the superadmin.
export async function issueCertificatesAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = certificateBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const written = await issueBookingCertificates(parsed.data.bookingId);
    revalidatePath(CERTIFICATES_DASHBOARD_PATH);
    return ok(written);
  } catch (error) {
    return mapError(error);
  }
}

// FR-POST-02: the superadmin releases certificates held back for unpaid people, with a reason in audit_logs.
export async function waiveCertificatesAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = waiveCertificatesSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    const released = await waiveCertificateRelease(parsed.data);
    revalidatePath(CERTIFICATES_DASHBOARD_PATH);
    return ok(released);
  } catch (error) {
    return mapError(error);
  }
}

// FR-POST-04: the superadmin revokes one certificate with a reason; /verifikasi then reads "Dicabut".
export async function revokeCertificateAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = revokeCertificateSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await revokeOneCertificate(parsed.data);
    revalidatePath(CERTIFICATES_DASHBOARD_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// FR-ADMIN-07 "Render ulang": the kept PDFs of a booking the staff member's RLS shows them are rendered again with
// today's signatory, under their name. The files are written with the service role, which skips RLS, so the scope is
// checked through the session client first.
export async function rerenderCertificatesAction(input: unknown): Promise<ActionResult<number>> {
  const parsed = certificateBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await assertSeesBookingCertificates(parsed.data.bookingId);
    const rendered = await rerenderCertificateFiles(parsed.data.bookingId, guard.ctx.userId);
    revalidatePath(CERTIFICATES_DASHBOARD_PATH);
    return ok(rendered);
  } catch (error) {
    return mapError(error);
  }
}

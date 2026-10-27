'use server';

import { headers } from 'next/headers';

import { certificatesCopy } from '@/lib/copy/certificates';
import { fail, mapError, ok } from '@/lib/errors';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { certificatePhoneSchema } from '@/lib/validations/guest-certificate';
import { requireGuestToken } from '@/server/auth/guards';
import { rememberCertificateProof } from '@/server/auth/guest-cookies';
import { stepUpGuestCertificates } from '@/server/services/document-service';
import type { ActionResult } from '@/types/action-result';

// /reservasi/[bookingCode]/sertifikat (Task P4.5.03; docs/Security.md §6.7, §10.3, DOC-02): the certificate link opens
// the page, and the last four digits of the PIC's verified number open the certificates that print a person's name.
// The downloads themselves are the route handler sertifikat/unduh/[slot] (review of PR #94, M1).

const text = certificatesCopy.guest;

export async function proveCertificatePhoneAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = certificatePhoneSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireGuestToken(parsed.data.bookingCode, 'certificate');
  if (!guard.ok) return guard;

  try {
    const answer = await stepUpGuestCertificates({
      bookingId: guard.guest.bookingId,
      lastFour: parsed.data.lastFour,
      clientIp: clientIpFrom(await headers()),
    });
    if (answer === 'verified') {
      await rememberCertificateProof(guard.guest);
      return ok(null);
    }
    if (answer === 'locked') return fail('RATE_LIMITED', undefined, text.locked);
    if (answer === 'blocked') return fail('FORBIDDEN', undefined, text.blocked);
    if (answer === 'unverified') return fail('STATE_INVALID', undefined, text.unverified);
    return fail('VALIDATION', { lastFour: [text.mismatch] }, text.mismatch);
  } catch (error) {
    return mapError(error);
  }
}

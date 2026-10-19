import { parseQuarantinePath, type QuarantineUpload } from '@/lib/uploads/paths';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { StaffContext } from '@/server/auth/guards';

import type { FakeAdminClient } from './fake-admin-client';

// Shared setup for the upload service's unit tests against the in-memory service-role client.

export const BOOKLET_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';

export const OFFICER_05: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 4,
};

const MINUTE_MS = 60_000;
const ARRIVAL_AFTER_SIGNING_MS = 5000;

// A file the browser put into RW 05's quarantine a few seconds after its URL was signed, a minute ago.
export function quarantinedIn(
  admin: FakeAdminClient,
  bytes: Buffer,
  objectName: (uuid: string) => string = (uuid) => uuid,
): QuarantineUpload {
  const signedAt = Date.now() - MINUTE_MS;
  const path = `rw-05/${objectName(createUuidV7(signedAt))}`;
  admin.receiveUpload(path, bytes, new Date(signedAt + ARRIVAL_AFTER_SIGNING_MS));
  const upload = parseQuarantinePath(path);
  if (!upload) throw new Error(`test path ${path} does not parse`);
  return upload;
}

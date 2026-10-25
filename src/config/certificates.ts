// The e-certificates (docs/PRD.md FR-POST-01, FR-POST-02, FR-ADMIN-07; Task P4.5.02, P4.5.03).

// A waiver or a revocation needs a reason of 3 to 300 characters, as public.issue_certificates and
// public.revoke_certificate check (20261025080000_certificate_rpcs.sql).
export const CERTIFICATE_REASON_LIMITS = { min: 3, max: 300 } as const;

export const CERTIFICATES_DASHBOARD_PATH = '/dashboard/certificates';

// The columns the list may be ordered by, through `?sort=`; anything else in the URL is ignored.
export const CERTIFICATE_SORT_COLUMNS = ['visit_date', 'institution_name'] as const;
export const CERTIFICATE_DEFAULT_SORT = 'visit_date.desc';

// Where a staff member downloads a certificate: api/documents/[kind]/[id], which authorises them first.
export function certificateDownloadPath(certificateId: string): string {
  return `/api/documents/certificate/${certificateId}`;
}

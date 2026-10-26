import type { Metadata } from 'next';

import { CertificateBoard } from '@/components/admin/certificates/certificate-board';
import { CERTIFICATE_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { certificatesCopy } from '@/lib/copy/certificates';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  issueCertificatesAction,
  rerenderCertificatesAction,
  revokeCertificateAction,
  waiveCertificatesAction,
} from '@/server/actions/certificates';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listCertificateBookings } from '@/server/services/certificate-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import type { ListFacet } from '@/types/data-table';

const text = certificatesCopy.dashboard;

export const metadata: Metadata = { title: text.title };
// "Render ulang PDF" runs on this page's Server Action and may render a whole class (docs/Security.md §10.4).
export const maxDuration = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_FACET: ListFacet = {
  param: 'status',
  title: text.facets.status,
  options: DB_ENUMS.certificate_status.map((status) => ({
    value: status,
    label: CERTIFICATE_STATUS[status].label,
  })),
};

// Task P4.5.03, docs/PRD.md FR-ADMIN-07: the certified bookings from `?q=&sort=&page=&status=&rw=`. An RW admin reads
// their own RW's whatever the URL says and issues or renders again; the superadmin picks the RW and also revokes and
// waives the unpaid hold.
export default async function CertificatesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits] = await Promise.all([effectiveRw(ctx, query.rw), listRwUnitsForStaff()]);
  if (ctx.role === 'admin_rw' && rw === null) return null;
  const result = await listCertificateBookings(query, rw);
  const facets = listFacets(isSuperadmin, {
    status: STATUS_FACET,
    rw: rwFacet(text.facets.rw, rwUnits),
  });

  return (
    <CertificateBoard
      rows={result.rows}
      total={result.total}
      facets={facets}
      issueAction={issueCertificatesAction}
      rerenderAction={rerenderCertificatesAction}
      superadminActions={
        isSuperadmin
          ? {
              waive: waiveCertificatesAction,
              revoke: revokeCertificateAction,
              stepUp: verifyStaffTotpAction,
            }
          : null
      }
    />
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BookingTable } from '@/components/admin/bookings/booking-table';
import { WalkInSheet } from '@/components/admin/bookings/walk-in-sheet';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { BOOKINGS_DASHBOARD_PATH } from '@/config/bookings';
import { BOOKING_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { firstPageAddress, visitDateFilterOf } from '@/lib/utils/booking-list';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import {
  createAdminBookingAction,
  listWalkInSessionsAction,
  previewWalkInQuoteAction,
  recordWalkInCashAction,
} from '@/server/actions/walk-in';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBookingsForStaff } from '@/server/services/booking-admin-service';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import { listWalkInPackages } from '@/server/services/walk-in-service';
import type { ListFacet } from '@/types/data-table';
import type { WalkInPackage } from '@/types/walk-in';

const text = bookingsAdminCopy.list;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Task P4.3.10: the officer's booking at the counter.
const WALK_IN_ACTIONS = {
  listSessions: listWalkInSessionsAction,
  previewQuote: previewWalkInQuoteAction,
  create: createAdminBookingAction,
  recordCash: recordWalkInCashAction,
  stepUp: verifyStaffTotpAction,
};

const STATUS_FACET: ListFacet = {
  param: 'status',
  title: text.facets.status,
  options: DB_ENUMS.booking_status.map((status) => ({
    value: status,
    label: BOOKING_STATUS[status].label,
  })),
};

// Task P4.3.10: "Pemesanan di loket" is the page's primary action, for an officer at AAL2.
function BookingsHeader(props: {
  canWalkIn: boolean;
  canTakeCash: boolean;
  packages: WalkInPackage[];
  maxPax: number;
}) {
  return (
    <DashboardPageHeader
      title={text.title}
      description={text.description}
      action={
        props.canWalkIn ? (
          <WalkInSheet
            packages={props.packages}
            maxPax={props.maxPax}
            canTakeCash={props.canTakeCash}
            actions={WALK_IN_ACTIONS}
          />
        ) : null
      }
    />
  );
}

// Task P4.3.02, docs/PRD.md FR-ADMIN-05: the bookings from `?q=&sort=&page=&status=&rw=&date=` through
// v_bookings_staff. An RW admin reads their own RW's bookings inside the view's window, whatever the URL says; the
// superadmin every booking, narrowed to the RW they pick.
export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const query = await loadListQuery(searchParams);
  const isSuperadmin = ctx.role === 'superadmin';
  const [rw, rwUnits, walkInPackages, settings] = await Promise.all([
    effectiveRw(ctx, query.rw),
    listRwUnitsForStaff(),
    listWalkInPackages(ctx),
    getPublicSiteSettings(),
  ]);
  if (!isSuperadmin && rw === null) return null;
  const visitDate = visitDateFilterOf(query.date);
  const result = await listBookingsForStaff(query, rw, visitDate);
  // A page past the end (rows that went away, a hand-typed ?page=) goes back to the first page of the same filters
  // instead of reading as a list that is empty from the start (review of PR #76, F-76-3).
  if (result.rows.length === 0 && query.page > 1)
    redirect(firstPageAddress(BOOKINGS_DASHBOARD_PATH, await searchParams));
  const facets = listFacets(isSuperadmin, {
    status: STATUS_FACET,
    rw: rwFacet(text.facets.rw, rwUnits),
  });

  return (
    <>
      <BookingsHeader
        canWalkIn={ctx.isAal2}
        canTakeCash={!isSuperadmin}
        packages={walkInPackages}
        maxPax={settings.maxPax}
      />
      {isSuperadmin ? null : <FormAlert tone="info">{text.windowNotice}</FormAlert>}
      <BookingTable rows={result.rows} total={result.total} facets={facets} visitDate={visitDate} />
    </>
  );
}

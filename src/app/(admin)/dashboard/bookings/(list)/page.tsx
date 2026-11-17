import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BookingTable } from '@/components/admin/bookings/booking-table';
import { BookingViews } from '@/components/admin/bookings/booking-views';
import { WalkInSheet } from '@/components/admin/bookings/walk-in-sheet';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { ADMIN_UNPAID_VIEW, BOOKINGS_DASHBOARD_PATH, UNDER_REVIEW_VIEW } from '@/config/bookings';
import { BOOKING_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { activeBookingView, firstPageAddress, visitDateFilterOf } from '@/lib/utils/booking-list';
import { todayInJakarta } from '@/lib/utils/dates';
import { listFacets, rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import { loadBookingPreviewAction } from '@/server/actions/booking-admin';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import {
  createAdminBookingAction,
  listWalkInSessionsAction,
  previewWalkInQuoteAction,
} from '@/server/actions/walk-in';
import { recordWalkInCashAction, sendWalkInPayLinkAction } from '@/server/actions/walk-in-cash';
import { effectiveRw } from '@/server/auth/content-owner';
import { requireDashboardStaff } from '@/server/auth/session';
import { listBookingsForStaff } from '@/server/services/booking-admin-service';
import { countBookingViews } from '@/server/services/booking-views-service';
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
  sendLink: sendWalkInPayLinkAction,
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

// docs/PRD.md §13.1 A23 addendum (delta review of PR #91, L-2c): the officers' holds still unpaid.
const VIEW_FACET: ListFacet = {
  param: 'category',
  title: text.facets.view,
  options: [
    { value: ADMIN_UNPAID_VIEW, label: text.facets.adminUnpaid },
    { value: UNDER_REVIEW_VIEW, label: text.facets.underReview },
  ],
};

function bookingFacets(
  isSuperadmin: boolean,
  rwUnits: Awaited<ReturnType<typeof listRwUnitsForStaff>>,
) {
  return listFacets(isSuperadmin, {
    status: STATUS_FACET,
    others: [VIEW_FACET],
    rw: rwFacet(text.facets.rw, rwUnits),
  });
}

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

// One page of the list and the view counts. A page past the end (rows that went away, a hand-typed ?page=) goes back
// to the first page of the same filters instead of reading as a list that is empty from the start (review of PR #76,
// F-76-3).
async function loadList(
  query: Awaited<ReturnType<typeof loadListQuery>>,
  rw: number | null,
  searchParams: SearchParams,
) {
  const visitDate = visitDateFilterOf(query.date);
  const today = todayInJakarta();
  const [result, viewCounts] = await Promise.all([
    listBookingsForStaff(query, rw, visitDate),
    countBookingViews(rw, today),
  ]);
  if (result.rows.length === 0 && query.page > 1)
    redirect(firstPageAddress(BOOKINGS_DASHBOARD_PATH, await searchParams));
  return { visitDate, today, result, viewCounts };
}

// The list with its filters and the preview panel's loader.
function BookingsTable(props: {
  result: Awaited<ReturnType<typeof listBookingsForStaff>>;
  rwUnits: Awaited<ReturnType<typeof listRwUnitsForStaff>>;
  isSuperadmin: boolean;
  visitDate: string | null;
}) {
  return (
    <BookingTable
      {...props.result}
      rws={props.rwUnits}
      facets={bookingFacets(props.isSuperadmin, props.rwUnits)}
      visitDate={props.visitDate}
      loadPreview={loadBookingPreviewAction}
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
  const { visitDate, today, result, viewCounts } = await loadList(query, rw, searchParams);

  return (
    <>
      <BookingsHeader
        canWalkIn={ctx.isAal2}
        canTakeCash={!isSuperadmin}
        packages={walkInPackages}
        maxPax={settings.maxPax}
      />
      {isSuperadmin ? null : <FormAlert tone="info">{text.windowNotice}</FormAlert>}
      <BookingViews
        active={activeBookingView({ ...query, date: visitDate }, today)}
        counts={viewCounts}
        today={today}
        rw={isSuperadmin ? rw : null}
      />
      <BookingsTable
        result={result}
        rwUnits={rwUnits}
        isSuperadmin={isSuperadmin}
        visitDate={visitDate}
      />
    </>
  );
}

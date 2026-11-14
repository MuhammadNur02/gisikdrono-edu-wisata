import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { AddonLines } from '@/components/admin/bookings/addon-lines';
import { AdminNotesForm } from '@/components/admin/bookings/admin-notes-form';
import {
  BookingInvoices,
  BookingLegs,
  BookingPayments,
  BookingSummary,
  BookingTimeline,
} from '@/components/admin/bookings/booking-sections';
import { BookingTickets } from '@/components/admin/bookings/booking-tickets';
import { ContactPanel } from '@/components/admin/bookings/contact-panel';
import { ParticipantsPanel } from '@/components/admin/bookings/participants-panel';
import { ReceiveCashButton } from '@/components/admin/bookings/receive-cash-button';
import { StaffActions } from '@/components/admin/bookings/staff-actions';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Button } from '@/components/ui/button';
import { BOOKINGS_DASHBOARD_PATH, STAFF_RESCHEDULE } from '@/config/bookings';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { resendOptionsFor } from '@/lib/utils/booking-resend-options';
import { staffStepsFor, type StaffSteps } from '@/lib/utils/booking-staff-steps';
import { cashBookingOf, hasOpenPayLink, isCashReceivable } from '@/lib/utils/walk-in-cash';
import {
  loadAddonNotesAction,
  loadBookingParticipantsAction,
  revealBookingContactAction,
  revokeTicketAction,
  saveAdminNotesAction,
  setAddonFulfillmentAction,
} from '@/server/actions/booking-admin';
import {
  cancelBookingAction,
  extendBookingHoldAction,
  previewCancellationAction,
  reactivateBookingAction,
  rescheduleBookingAction,
  resendMessageAction,
  resolveBookingReviewAction,
} from '@/server/actions/booking-staff';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { recordWalkInCashAction } from '@/server/actions/walk-in-cash';
import { requireDashboardStaff } from '@/server/auth/session';
import {
  getBookingDetail,
  listBookingAddons,
  listBookingTimeline,
} from '@/server/services/booking-admin-service';
import {
  listMessageHistory,
  listRescheduleLegs,
  listReviewLegs,
} from '@/server/services/booking-staff-service';
import type { BookingAddonLine, BookingDetail, BookingTimelineEvent } from '@/types/booking-admin';
import type { RescheduleLeg, ResendOption, ReviewLeg } from '@/types/booking-staff';

const text = bookingsAdminCopy.detail;
const idSchema = z.uuid();

export const metadata: Metadata = { title: bookingsAdminCopy.list.title };

interface BookingPageProps {
  params: Promise<{ id: string }>;
}

function BackLink() {
  return (
    <Button asChild variant="ghost" className="min-h-11 self-start">
      <Link href={BOOKINGS_DASHBOARD_PATH}>
        <ArrowLeft aria-hidden />
        {text.back}
      </Link>
    </Button>
  );
}

interface MainColumnProps {
  booking: BookingDetail;
  addons: BookingAddonLine[];
  isSuperadmin: boolean;
  canReceiveCash: boolean;
}

// Task P4.3.10 (A23): the cash an RW admin takes later for an officer's booking of their RW, also while the PIC has
// a pay link open, which the cash ends (delta review of PR #91, M-1).
function ReceiveCash({ booking }: { booking: BookingDetail }) {
  const cash = cashBookingOf(booking);
  if (cash === null) return null;
  return (
    <ReceiveCashButton
      booking={cash}
      hasOpenPayLink={hasOpenPayLink(booking)}
      action={recordWalkInCashAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );
}

function MainColumn({ booking, addons, isSuperadmin, canReceiveCash }: MainColumnProps) {
  return (
    <div className="flex flex-col gap-6 lg:col-span-2">
      <BookingSummary booking={booking} />
      <BookingLegs booking={booking} />
      <AddonLines
        bookingId={booking.id}
        lines={addons}
        notesAction={loadAddonNotesAction}
        action={booking.isAnonymised ? null : setAddonFulfillmentAction}
      />
      <BookingTickets
        booking={booking}
        revokeAction={
          isSuperadmin ? { revoke: revokeTicketAction, stepUp: verifyStaffTotpAction } : null
        }
      />
      {canReceiveCash ? <ReceiveCash booking={booking} /> : null}
      <BookingPayments booking={booking} />
      <BookingInvoices booking={booking} />
    </div>
  );
}

// Task P4.3.08 (docs/PRD.md §13.1 A28): the staff steps the booking takes now.
const STAFF_STEP_ACTIONS = {
  cancel: cancelBookingAction,
  preview: previewCancellationAction,
  extend: extendBookingHoldAction,
  reactivate: reactivateBookingAction,
  resend: resendMessageAction,
  resolveReview: resolveBookingReviewAction,
  reschedule: rescheduleBookingAction,
  stepUp: verifyStaffTotpAction,
};

function SideColumn({
  booking,
  timeline,
  steps,
  choices,
}: {
  booking: BookingDetail;
  timeline: BookingTimelineEvent[];
  steps: StaffSteps;
  choices: StaffChoices;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StaffActions
        booking={{ id: booking.id, code: booking.bookingCode, isPaid: booking.status === 'paid' }}
        can={steps}
        reviewLegs={choices.reviewLegs}
        reschedule={choices.reschedule}
        resendOptions={choices.resendOptions}
        actions={STAFF_STEP_ACTIONS}
      />
      <ContactPanel
        bookingId={booking.id}
        contact={booking}
        revealAction={revealBookingContactAction}
      />
      <ParticipantsPanel bookingId={booking.id} action={loadBookingParticipantsAction} />
      {booking.isAnonymised ? null : (
        <AdminNotesForm
          bookingId={booking.id}
          adminNotes={booking.adminNotes}
          action={saveAdminNotesAction}
        />
      )}
      <BookingTimeline events={timeline} />
    </div>
  );
}

// The booking with its lines and history; null when RLS does not show the booking. The lines' notes are an audited
// read the staff member asks for on the card (review of PR #76, F-76-5).
async function loadBooking(bookingId: string) {
  const [booking, addons, timeline] = await Promise.all([
    getBookingDetail(bookingId),
    listBookingAddons(bookingId),
    listBookingTimeline(bookingId),
  ]);
  return booking === null ? null : { booking, addons, timeline };
}

interface StaffChoices {
  reviewLegs: ReviewLeg[];
  resendOptions: ResendOption[];
  reschedule: { legs: RescheduleLeg[]; movesLeft: number };
}

// What the staff sheets offer: a review's sessions to move to, the legs a reschedule may move and where, and the
// messages that may go to the PIC now.
async function loadStaffChoices(
  booking: BookingDetail,
  steps: StaffSteps,
  staffMoves: number,
): Promise<StaffChoices> {
  const [reviewLegs, rescheduleLegs, messageHistory] = await Promise.all([
    steps.resolveReview ? listReviewLegs(booking) : [],
    steps.reschedule ? listRescheduleLegs(booking) : [],
    steps.resend ? listMessageHistory(booking.id) : [],
  ]);
  return {
    reviewLegs,
    resendOptions: resendOptionsFor(booking, messageHistory, new Date()),
    reschedule: { legs: rescheduleLegs, movesLeft: STAFF_RESCHEDULE.maxMoves - staffMoves },
  };
}

// The steps the booking offers this staff member now, and what their sheets choose from. The moves an officer made
// are counted from the timeline, as public.reschedule_booking counts them.
async function loadStaffView(
  booking: BookingDetail,
  timeline: BookingTimelineEvent[],
  staff: { role: string; isAal2: boolean },
): Promise<{ steps: StaffSteps; choices: StaffChoices }> {
  const staffMoves = timeline.filter((event) => event.reason === STAFF_RESCHEDULE.reason).length;
  const steps = staffStepsFor(
    booking,
    { isSuperadmin: staff.role === 'superadmin', isAal2: staff.isAal2 },
    new Date(),
    staffMoves,
  );
  return { steps, choices: await loadStaffChoices(booking, steps, staffMoves) };
}

// Task P4.3.02, docs/PRD.md FR-ADMIN-05: one booking through v_booking_admin. RLS answers the scope: a booking outside
// an RW admin's RW or window, or an id that names nothing, is the same 404 (docs/Security.md AZ-12).
export default async function BookingDetailPage({ params }: BookingPageProps) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const loaded = await loadBooking(parsedId.data);
  if (loaded === null) notFound();
  const { booking, addons, timeline } = loaded;
  const { steps, choices } = await loadStaffView(booking, timeline, ctx);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <DashboardPageHeader
        title={booking.bookingCode}
        description={
          booking.institutionName ?? booking.picFirstName ?? bookingsAdminCopy.list.individual
        }
        action={<StatusBadge kind="booking_status" value={booking.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <MainColumn
          booking={booking}
          addons={addons}
          isSuperadmin={ctx.role === 'superadmin'}
          canReceiveCash={isCashReceivable(
            booking,
            ctx.role === 'admin_rw' && ctx.isAal2,
            new Date(),
          )}
        />
        <SideColumn booking={booking} timeline={timeline} steps={steps} choices={choices} />
      </div>
    </div>
  );
}

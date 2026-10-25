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
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Button } from '@/components/ui/button';
import { BOOKINGS_DASHBOARD_PATH } from '@/config/bookings';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import {
  loadBookingParticipantsAction,
  revealBookingContactAction,
  revokeTicketAction,
  saveAdminNotesAction,
  setAddonFulfillmentAction,
} from '@/server/actions/booking-admin';
import { requireDashboardStaff } from '@/server/auth/session';
import {
  getBookingDetail,
  listAddonNotes,
  listBookingAddons,
  listBookingTimeline,
} from '@/server/services/booking-admin-service';
import type { BookingAddonLine, BookingDetail, BookingTimelineEvent } from '@/types/booking-admin';

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
  // The visitor's notes on the lines, by line id, as rpc_get_addon_notes returned them.
  addonNotes: Record<string, string>;
  isSuperadmin: boolean;
}

function MainColumn({ booking, addons, addonNotes, isSuperadmin }: MainColumnProps) {
  return (
    <div className="flex flex-col gap-6 lg:col-span-2">
      <BookingSummary booking={booking} />
      <BookingLegs booking={booking} />
      <AddonLines
        bookingId={booking.id}
        lines={addons}
        notes={addonNotes}
        action={booking.isAnonymised ? null : setAddonFulfillmentAction}
      />
      <BookingTickets booking={booking} revokeAction={isSuperadmin ? revokeTicketAction : null} />
      <BookingPayments booking={booking} />
      <BookingInvoices booking={booking} />
    </div>
  );
}

function SideColumn({
  booking,
  timeline,
}: {
  booking: BookingDetail;
  timeline: BookingTimelineEvent[];
}) {
  return (
    <div className="flex flex-col gap-6">
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

// The booking with its lines, history and the notes of those lines; null when RLS does not show the booking. The notes
// are an audited read, so they are asked for only when there are lines to show them on.
async function loadBooking(bookingId: string) {
  const [booking, addons, timeline] = await Promise.all([
    getBookingDetail(bookingId),
    listBookingAddons(bookingId),
    listBookingTimeline(bookingId),
  ]);
  if (booking === null) return null;
  const notes = addons.length > 0 ? await listAddonNotes(bookingId) : new Map<string, string>();
  return { booking, addons, timeline, addonNotes: Object.fromEntries(notes) };
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
  const { booking, addons, timeline, addonNotes } = loaded;

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
          addonNotes={addonNotes}
          isSuperadmin={ctx.role === 'superadmin'}
        />
        <SideColumn booking={booking} timeline={timeline} />
      </div>
    </div>
  );
}

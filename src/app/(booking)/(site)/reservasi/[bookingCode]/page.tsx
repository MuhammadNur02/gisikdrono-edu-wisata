import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BookingTimeline } from '@/components/booking/booking-timeline';
import { DocumentLinks } from '@/components/booking/document-links';
import {
  CancelPanel,
  QuotedConfirm,
  RevokePanel,
  TreasurerCard,
  WeatherPanel,
  type HubActions,
} from '@/components/booking/hub-manage';
import { HubDetails, HubHelp, HubTerms } from '@/components/booking/hub-side';
import { HubStatusCard } from '@/components/booking/hub-status-card';
import { GUEST_BOOKING_PATH, GUEST_LINK_PARAM } from '@/config/guest';
import { siteConfig } from '@/config/site';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import {
  cancelBookingAction,
  confirmQuotationAction,
  rescheduleBookingAction,
  revokeGuestLinksAction,
} from '@/server/actions/guest';
import { requestPhoneOtpAction, verifyPhoneOtpAction } from '@/server/actions/otp';
import { requireGuestToken } from '@/server/auth/guards';
import { loadStatusHub, type StatusHubData } from '@/server/services/booking-service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: bookingHubCopy.title,
  robots: { index: false, follow: false },
};

const ACTIONS: HubActions = {
  cancel: cancelBookingAction,
  reschedule: rescheduleBookingAction,
  confirmQuotation: confirmQuotationAction,
  otp: { requestAction: requestPhoneOtpAction, verifyAction: verifyPhoneOtpAction },
  revoke: revokeGuestLinksAction,
};

interface StatusHubPageProps {
  params: Promise<{ bookingCode: string }>;
}

function payUrlOf(bookingCode: string, token: string): string {
  return `${siteConfig.url}${GUEST_BOOKING_PATH}/${bookingCode}/bayar?${GUEST_LINK_PARAM}=${token}`;
}

// The panels only the manage link opens, inside the status card: the quotation's confirmation, the weather choices.
function ManagePanels({ hub, canManage }: { hub: StatusHubData; canManage: boolean }) {
  const { view } = hub;
  const code = view.booking.bookingCode;
  return (
    <>
      {canManage && view.booking.status === 'quoted' && (
        <QuotedConfirm bookingCode={code} actions={ACTIONS} />
      )}
      {hub.weather && (
        <WeatherPanel
          bookingCode={code}
          weather={hub.weather}
          refund={hub.weatherRefund}
          actions={ACTIONS}
        />
      )}
    </>
  );
}

function SideColumn({
  hub,
  canManage,
  whatsappNumber,
}: {
  hub: StatusHubData;
  canManage: boolean;
  whatsappNumber: string;
}) {
  const { view } = hub;
  const code = view.booking.bookingCode;
  return (
    <aside className="flex flex-col gap-6 lg:w-95 lg:shrink-0">
      <HubDetails view={view} />
      <DocumentLinks view={view} />
      <HubTerms terms={view.terms} />
      <HubHelp bookingCode={code} whatsappNumber={whatsappNumber} />
      {canManage && (
        <div className="space-y-3 px-1">
          <CancelPanel view={view} quote={hub.cancellation} actions={ACTIONS} />
          <RevokePanel bookingCode={code} actions={ACTIONS} />
        </div>
      )}
    </aside>
  );
}

// docs/PRD.md FR-BOOK-11, FR-BOOK-23..25 (Task P3.12.01, P3.12.02; DESIGN-SPEC §3.11): the booking as the database
// has it, never as a redirect's query string says. A view link reads; a manage link also confirms, cancels, moves
// after a weather notice and hands the treasurer the pay link. Any other visitor gets the 404 of an unknown code.
export default async function StatusHubPage({ params }: StatusHubPageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'view');
  if (!guard.ok) notFound();
  const [hub, settings] = await Promise.all([loadStatusHub(guard.guest), getPublicSiteSettings()]);
  const canManage = guard.guest.scope === 'manage';
  return (
    <div className="flex w-full max-w-300 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <HubStatusCard view={hub.view}>
          <ManagePanels hub={hub} canManage={canManage} />
        </HubStatusCard>
        {hub.payLinkToken && <TreasurerCard payUrl={payUrlOf(bookingCode, hub.payLinkToken)} />}
        <BookingTimeline view={hub.view} />
      </div>
      <SideColumn
        hub={hub}
        canManage={canManage}
        whatsappNumber={settings.contactWhatsappNumber ?? siteConfig.whatsappContactNumber}
      />
    </div>
  );
}

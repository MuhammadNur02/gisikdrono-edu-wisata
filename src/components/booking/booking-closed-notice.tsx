import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';

const text = copy.booking.wizard;

// docs/PRD.md FR-BOOK-01: what a booking page shows instead of its form while booking is closed, in words that say
// whether it is closed for now (booking_enabled off, maintenance) or not open yet (pre-launch, docs/Security.md §8.9).
export function BookingClosedNotice({ isPrelaunch }: { isPrelaunch: boolean }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-16 md:py-24">
      <FormAlert tone="info">
        <p className="font-medium">{isPrelaunch ? text.prelaunchTitle : text.closedTitle}</p>
        <p>{isPrelaunch ? text.prelaunch : text.closed}</p>
      </FormAlert>
    </div>
  );
}

import type { RESEND_CHANNELS, RESENDABLE_TEMPLATES } from '@/config/bookings';
import type { EnumValue } from '@/db/enums';

// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md §13.1 A28). Plain values: they cross into
// client components.

export interface SessionChoice {
  value: string;
  label: string;
}

// One leg of a booking under review and the open sessions of its RW it may move to.
export interface ReviewLeg {
  rwLabel: string;
  sessions: SessionChoice[];
}

// A message the booking had, as the staff member's RLS shows it of public.notifications: never to whom or with what.
export interface MessageHistoryEntry {
  template: EnumValue<'notification_template'>;
  channel: EnumValue<'notification_channel'>;
  status: EnumValue<'notification_status'>;
  createdAt: string;
}

// A channel a message may go on now: lastQueuedAt is when it was last queued there, null for a first reminder.
export interface ResendChannelOption {
  channel: (typeof RESEND_CHANNELS)[number];
  lastQueuedAt: string | null;
}

// A message staff may send to the PIC now, with the channels it may go on.
export interface ResendOption {
  template: (typeof RESENDABLE_TEMPLATES)[number];
  channels: ResendChannelOption[];
}

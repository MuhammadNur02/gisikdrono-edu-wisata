import { Hand, Users } from 'lucide-react';

import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { attendanceCopy } from '@/lib/copy/attendance';
import { formatClockTime, formatTimeRange } from '@/lib/utils/dates';
import type { AttendanceTicket } from '@/types/attendance';

const text = attendanceCopy.today;

function groupName(ticket: AttendanceTicket): string {
  return [ticket.institutionName, ticket.picFirstName].filter(Boolean).join(' · ');
}

function sessionText(ticket: AttendanceTicket): string {
  const time =
    ticket.startTime && ticket.endTime ? formatTimeRange(ticket.startTime, ticket.endTime) : '';
  return [ticket.sessionLabel, time].filter(Boolean).join(' · ');
}

function PaxLine({ ticket }: { ticket: AttendanceTicket }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-body-sm">
      <div>
        <dt className="text-caption text-muted-foreground">{text.booked}</dt>
        <dd className="font-medium tabular-nums">{ticket.bookedPax}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">{text.checkedIn}</dt>
        <dd className="font-medium tabular-nums">{ticket.checkedInPax}</dd>
      </div>
      <div>
        <dt className="text-caption text-muted-foreground">{text.unpaid}</dt>
        <dd className="font-medium tabular-nums">{ticket.unpaidPax}</dd>
      </div>
    </dl>
  );
}

function TicketItem({ ticket }: { ticket: AttendanceTicket }) {
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">{ticket.ticketCode}</span>
        <StatusBadge kind="ticket_status" value={ticket.status} />
        {ticket.isManual ? (
          <Badge variant="info">
            <Hand aria-hidden />
            {text.manual}
          </Badge>
        ) : null}
      </div>
      <p className="text-body-sm">{groupName(ticket)}</p>
      <p className="text-caption text-muted-foreground">
        {[
          sessionText(ticket),
          ticket.checkedInAt ? text.checkedInAt(formatClockTime(ticket.checkedInAt)) : text.notYet,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <PaxLine ticket={ticket} />
      {/* TODO(P4.4.01, P4.4.04): undo check-in and manual check-in for this ticket, once their RPCs exist. */}
    </li>
  );
}

function TicketList({ tickets }: { tickets: AttendanceTicket[] | null }) {
  if (tickets === null) {
    return <p className="text-body-sm text-muted-foreground">{text.unavailable}</p>;
  }
  if (tickets.length === 0) {
    return <EmptyState icon={Users} title={text.empty} description={text.emptyHint} />;
  }
  return (
    <ul className="flex flex-col divide-y">
      {tickets.map((ticket) => (
        <TicketItem key={ticket.ticketId} ticket={ticket} />
      ))}
    </ul>
  );
}

// docs/PRD.md FR-ADMIN-06: today's groups from v_attendance_today, booked against checked-in pax, unpaid pax and the
// manual badge. One column of cards, which reads the same at 360 px as on a desktop.
export function TodayList({ tickets }: { tickets: AttendanceTicket[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h4">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TicketList tickets={tickets} />
      </CardContent>
    </Card>
  );
}

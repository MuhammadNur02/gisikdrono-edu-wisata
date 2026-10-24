import type { EnumValue } from '@/db/enums';
import type { ListRow } from '@/types/data-table';

// /dashboard/attendance (Task P4.3.09). Names stop at the group's institution and the PIC's first name, which
// v_attendance_today carries; no phone, email or participant name reaches the page (docs/Security.md DATA-04).

export interface AttendanceTicket {
  ticketId: string;
  ticketCode: string;
  institutionName: string | null;
  picFirstName: string | null;
  sessionLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  status: EnumValue<'ticket_status'>;
  bookedPax: number;
  checkedInPax: number;
  unpaidPax: number;
  checkedInAt: string | null;
  isManual: boolean;
}

export type ScanSource = 'qr' | 'manual' | 'manual_backfill';

export interface ScanHistoryRow extends ListRow {
  scannedAt: string;
  ticketCode: string;
  sessionLabel: string | null;
  startTime: string | null;
  endTime: string | null;
  phase: EnumValue<'scan_phase'>;
  result: EnumValue<'scan_result'>;
  source: ScanSource;
  attendeeCount: number | null;
  bookedPax: number;
  checkedInPax: number;
  unpaidPax: number;
  // null when RLS does not show the officer's profile (another RW's colleague, the superadmin).
  officerName: string | null;
}

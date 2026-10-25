import { rwLabel } from '@/config/rw';
import {
  ALERT_SEVERITY,
  BOOKING_LEG_STATUS,
  BOOKING_STATUS,
  TICKET_STATUS,
  type StatusMeta,
} from '@/config/status';
import type { EnumValue } from '@/db/enums';
import type { Json } from '@/db/types';
import { bookingWizardCopy } from '@/lib/copy/booking-wizard';
import { exportsCopy } from '@/lib/copy/exports';
import type { CsvCell, CsvColumn } from '@/lib/utils/csv';

// The columns of each export file (Task P4.6.02), over the rows rpc_create_export hands back, whose fields are named by
// its migration (20261027080100_export_rpc.sql). The database decided what may be in a row (no contact, no participant
// name, no IP); this only names and formats the columns, in the order a reader expects. Pure.

export type ExportKind = EnumValue<'export_kind'>;
export type ExportRow = Readonly<Record<string, Json | undefined>>;

const text = exportsCopy.columns;

// How a field is written: as it is, as `RW 05`, as Ya/Tidak, as the JSON text of a before/after object, or as the
// Indonesian label of an enum value (src/config/status.ts, the dashboard's own words).
type CellKind = 'plain' | 'rw' | 'flag' | 'json' | 'label';

type Labels = Readonly<Record<string, string>>;

interface FieldColumn {
  header: string;
  field: string;
  kind?: CellKind;
  labels?: Labels;
}

function labelsOf(statuses: Readonly<Record<string, StatusMeta>>): Labels {
  return Object.fromEntries(Object.entries(statuses).map(([value, meta]) => [value, meta.label]));
}

const BOOKING_STATUS_LABELS = labelsOf(BOOKING_STATUS);
const LEG_STATUS_LABELS = labelsOf(BOOKING_LEG_STATUS);
const TICKET_STATUS_LABELS = labelsOf(TICKET_STATUS);
const SEVERITY_LABELS = labelsOf(ALERT_SEVERITY);
const BOOKER_TYPE_LABELS: Labels = bookingWizardCopy.booker.bookerTypes;

const VISIT_COLUMNS: readonly FieldColumn[] = [
  { header: text.sessionDate, field: 'session_date' },
  { header: text.startTime, field: 'start_time' },
  { header: text.sessionLabel, field: 'session_label' },
  { header: text.rw, field: 'rw_id', kind: 'rw' },
  { header: text.bookingCode, field: 'booking_code' },
  {
    header: text.bookingStatus,
    field: 'booking_status',
    kind: 'label',
    labels: BOOKING_STATUS_LABELS,
  },
  { header: text.packageName, field: 'package_name' },
  { header: text.bookerType, field: 'booker_type', kind: 'label', labels: BOOKER_TYPE_LABELS },
  { header: text.institution, field: 'institution_name' },
  { header: text.legPax, field: 'leg_pax' },
  { header: text.legStatus, field: 'leg_status', kind: 'label', labels: LEG_STATUS_LABELS },
  { header: text.ticketCode, field: 'ticket_code' },
  {
    header: text.ticketStatus,
    field: 'ticket_status',
    kind: 'label',
    labels: TICKET_STATUS_LABELS,
  },
  { header: text.checkedInPax, field: 'checked_in_pax' },
  { header: text.unpaidPax, field: 'unpaid_pax' },
  { header: text.paidAt, field: 'paid_at' },
  { header: text.totalAmount, field: 'total_amount' },
];

const ATTENDANCE_COLUMNS: readonly FieldColumn[] = [
  { header: text.sessionDate, field: 'session_date' },
  { header: text.startTime, field: 'start_time' },
  { header: text.sessionLabel, field: 'session_label' },
  { header: text.rw, field: 'rw_id', kind: 'rw' },
  { header: text.bookingCode, field: 'booking_code' },
  { header: text.institution, field: 'institution_name' },
  { header: text.bookedPax, field: 'booked_pax' },
  { header: text.checkedInPax, field: 'checked_in_pax' },
  { header: text.unpaidPax, field: 'unpaid_pax' },
  {
    header: text.ticketStatus,
    field: 'ticket_status',
    kind: 'label',
    labels: TICKET_STATUS_LABELS,
  },
  { header: text.manualCheckin, field: 'manual_checkin', kind: 'flag' },
];

const FINANCE_COLUMNS: readonly FieldColumn[] = [
  { header: text.entryId, field: 'id' },
  { header: text.day, field: 'day' },
  { header: text.bookingCode, field: 'booking_code' },
  { header: text.entryType, field: 'entry_type', kind: 'label', labels: text.entryTypes },
  { header: text.beneficiary, field: 'beneficiary', kind: 'label', labels: text.beneficiaries },
  { header: text.beneficiaryKey, field: 'beneficiary_key' },
  { header: text.rw, field: 'rw_id', kind: 'rw' },
  { header: text.lineRef, field: 'line_ref' },
  { header: text.baseAmount, field: 'base_amount' },
  { header: text.pct, field: 'pct' },
  { header: text.amount, field: 'amount' },
  { header: text.payoutBatch, field: 'payout_batch_id' },
];

const AUDIT_COLUMNS: readonly FieldColumn[] = [
  { header: text.occurredAt, field: 'occurred_at' },
  { header: text.source, field: 'source' },
  { header: text.logId, field: 'id' },
  { header: text.actorId, field: 'actor_id' },
  { header: text.actorRole, field: 'actor_role' },
  { header: text.action, field: 'action' },
  { header: text.severity, field: 'severity', kind: 'label', labels: SEVERITY_LABELS },
  { header: text.entityType, field: 'entity_type' },
  { header: text.entityId, field: 'entity_id' },
  { header: text.rw, field: 'rw_id', kind: 'rw' },
  { header: text.before, field: 'before', kind: 'json' },
  { header: text.after, field: 'after', kind: 'json' },
  { header: text.details, field: 'details', kind: 'json' },
];

const COLUMNS_BY_KIND: Record<ExportKind, readonly FieldColumn[]> = {
  visits: VISIT_COLUMNS,
  attendance: ATTENDANCE_COLUMNS,
  finance: FINANCE_COLUMNS,
  audit: AUDIT_COLUMNS,
};

function plainCell(value: Json | undefined): CsvCell {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

// A value the labels do not know (an enum value added later) is written as it is rather than dropped.
function labelCell(value: Json, labels: Labels | undefined): CsvCell {
  return typeof value === 'string' ? (labels?.[value] ?? value) : plainCell(value);
}

function flagCell(value: Json): CsvCell {
  if (typeof value !== 'boolean') return plainCell(value);
  return value ? text.yes : text.no;
}

// Each kind writes the value it expects and leaves any other as it is.
const CELL_WRITERS: Record<CellKind, (value: Json, labels?: Labels) => CsvCell> = {
  plain: plainCell,
  label: labelCell,
  rw: (value) => (typeof value === 'number' ? rwLabel(value) : plainCell(value)),
  flag: flagCell,
  json: (value) => JSON.stringify(value),
};

export function cellOf(
  value: Json | undefined,
  kind: CellKind = 'plain',
  labels?: Labels,
): CsvCell {
  if (value === undefined || value === null) return null;
  return CELL_WRITERS[kind](value, labels);
}

export function exportColumns(kind: ExportKind): CsvColumn<ExportRow>[] {
  return COLUMNS_BY_KIND[kind].map((column) => ({
    header: column.header,
    value: (row) => cellOf(row[column.field], column.kind, column.labels),
  }));
}

function isRow(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The rows of the RPC's answer, objects only: anything else would be a change of the RPC, not of the data.
export function exportRowsOf(rows: Json | undefined): ExportRow[] {
  return Array.isArray(rows) ? rows.filter(isRow) : [];
}

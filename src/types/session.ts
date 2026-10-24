import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { SessionOption } from '@/types/forms';
import type { RwBadge } from '@/types/rw-unit';

// One bookable session from v_session_availability, read uncached so the seats left are current.
export interface AvailableSession extends SessionOption {
  rwId: RwId;
  sessionDate: string;
}

// The sessions one RW of a package can book now, in the package's leg order (Task P3.5.01).
export interface BookableLeg {
  rw: RwBadge;
  sessions: AvailableSession[];
}

// What /dashboard/sessions reads and its actions answer with (Task P4.3.04). Plain values only: they cross into
// client components. Times are Postgres `time` values (`08:00:00`), dates visit dates (`2026-11-07`).
export interface VisitSessionAdmin {
  id: string;
  rwId: RwId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  label: string;
  capacity: number;
  // Written only by the internal quota functions and check-in (CLAUDE.md §7.1); read here for the occupancy chip.
  reservedPax: number;
  checkedInPax: number;
  status: EnumValue<'session_status'>;
  templateId: string | null;
  notes: string | null;
}

export interface SessionTemplateAdmin {
  id: string;
  rwId: RwId;
  // 0 = Sunday, as session_templates.weekday counts it.
  weekday: number;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
}

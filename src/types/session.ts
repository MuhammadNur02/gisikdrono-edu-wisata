import type { RwId } from '@/config/rw';
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

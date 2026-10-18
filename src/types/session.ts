import type { RwId } from '@/config/rw';
import type { SessionOption } from '@/types/forms';

// One bookable session from v_session_availability, read uncached so the seats left are current.
export interface AvailableSession extends SessionOption {
  rwId: RwId;
  sessionDate: string;
}

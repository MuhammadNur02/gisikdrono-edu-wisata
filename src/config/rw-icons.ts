import { Drama, HeartHandshake, Landmark, Recycle, Users, type LucideIcon } from 'lucide-react';

import type { RwIcon } from '@/config/rw';

// rw_units.icon_key: the icon that stands in a photo slot of the RW before its photo exists (docs/StyleGuide.md
// §1.3 G1, §8.1). Kept apart from src/config/rw.ts so a client component that only needs an RW's colours does not
// ship these icons.
export const RW_ICONS: Record<RwIcon, LucideIcon> = {
  recycle: Recycle,
  drama: Drama,
  heart_handshake: HeartHandshake,
  landmark: Landmark,
  users: Users,
};

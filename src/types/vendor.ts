import type { RwId } from '@/config/rw';

// A vendor as staff see it in the vendors sheet (Task P4.3.06): the owner's name and phone are staff-only; the bank
// columns are granted to no API role and are not part of it. There is no public vendor type: since the decision of
// 2026-10-29 the public site names no seller (docs/Security.md DATA-14).
export interface VendorAdmin {
  id: string;
  rwId: RwId;
  slug: string;
  name: string;
  ownerName: string | null;
  phone: string | null;
  descriptionMd: string | null;
  isActive: boolean;
}

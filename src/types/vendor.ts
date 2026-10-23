import type { RwId } from '@/config/rw';
import type { PublicImage } from '@/types/media';

// The public face of a UMKM vendor. Owner name, phone and bank details are granted to no anonymous reader.
export interface VendorProfile {
  id: string;
  slug: string;
  name: string;
  rwId: RwId;
  descriptionMd: string | null;
  logo: PublicImage | null;
}

export interface VendorReference {
  slug: string;
  name: string;
}

// A vendor as staff see it in the vendors sheet (Task P4.3.06): the owner's name and phone are staff-only; the bank
// columns are granted to no API role and are not part of it.
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

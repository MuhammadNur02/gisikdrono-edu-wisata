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

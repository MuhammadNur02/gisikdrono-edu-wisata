import type { RwId } from '@/config/rw';

// Who a row of the CMS belongs to: an RW, or the kelurahan (rw_id NULL), which is the superadmin's.
export type ContentOwner = RwId | null;

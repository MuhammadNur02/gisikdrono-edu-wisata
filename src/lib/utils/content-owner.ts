import { RW_PROGRAMMES } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import type { GalleryOwner } from '@/lib/queries/tags';
import type { ContentOwner } from '@/types/content';

// `RW 05`, `RW 08` or `Kelurahan`, as the dashboard names the owner of a row.
export function contentOwnerLabel(owner: ContentOwner): string {
  return owner === null ? copy.cms.owner.kelurahan : RW_PROGRAMMES[owner].label;
}

// galleries.rw_id NULL is the kelurahan's gallery, which has a revalidation tag of its own.
export function contentOwnerTagOf(owner: ContentOwner): GalleryOwner {
  return owner ?? 'kelurahan';
}

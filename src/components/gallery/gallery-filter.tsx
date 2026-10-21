import { FilterChipLink } from '@/components/marketing/filter-chips';
import {
  GALLERY_CATEGORY_FILTER_VALUES,
  GALLERY_CATEGORY_FILTERS,
  galleryFilterForRw,
  type GalleryFilterValue,
} from '@/config/gallery';
import { copy } from '@/lib/copy/id';
import { galleryPath } from '@/lib/utils/gallery-search';
import type { RwBadge } from '@/types/rw-unit';

export interface GalleryFilterProps {
  active: GalleryFilterValue | null;
  // The RWs that are online, in their order: one pill each, before the categories.
  rws: readonly RwBadge[];
}

// docs/StyleGuide.md §5.11: the pills of `?filter=`, plain links, so the gallery filters without script and
// every filtered view has an address of its own. A new filter starts again at the first page.
export function GalleryFilter({ active, rws }: GalleryFilterProps) {
  const options = [
    ...rws.map((rw) => ({ value: galleryFilterForRw(rw.id), label: rw.label })),
    ...GALLERY_CATEGORY_FILTER_VALUES.map((value) => ({
      value,
      label: GALLERY_CATEGORY_FILTERS[value].label,
    })),
  ];
  return (
    <nav aria-label={copy.gallery.filterLabel} className="flex flex-wrap gap-2">
      <FilterChipLink href={galleryPath({ filter: null, page: 1 })} isCurrent={active === null}>
        {copy.catalogue.filterAll}
      </FilterChipLink>
      {options.map((option) => (
        <FilterChipLink
          key={option.value}
          href={galleryPath({ filter: option.value, page: 1 })}
          isCurrent={active === option.value}
        >
          {option.label}
        </FilterChipLink>
      ))}
    </nav>
  );
}

import { FilterChipLink } from '@/components/marketing/filter-chips';
import { GALLERY_FILTER_VALUES, GALLERY_FILTERS, type GalleryFilterValue } from '@/config/gallery';
import { copy } from '@/lib/copy/id';
import { galleryPath } from '@/lib/utils/gallery-search';

export interface GalleryFilterProps {
  active: GalleryFilterValue | null;
}

// docs/StyleGuide.md §5.11: the pills of `?filter=`, plain links, so the gallery filters without script and
// every filtered view has an address of its own. A new filter starts again at the first page.
export function GalleryFilter({ active }: GalleryFilterProps) {
  return (
    <nav aria-label={copy.gallery.filterLabel} className="flex flex-wrap gap-2">
      <FilterChipLink href={galleryPath({ filter: null, page: 1 })} isCurrent={active === null}>
        {copy.catalogue.filterAll}
      </FilterChipLink>
      {GALLERY_FILTER_VALUES.map((filter) => (
        <FilterChipLink
          key={filter}
          href={galleryPath({ filter, page: 1 })}
          isCurrent={active === filter}
        >
          {GALLERY_FILTERS[filter].label}
        </FilterChipLink>
      ))}
    </nav>
  );
}

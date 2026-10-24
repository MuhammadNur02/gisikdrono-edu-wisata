import { FilterChipLink } from '@/components/marketing/filter-chips';
import {
  GALLERY_CATEGORY_FILTER_VALUES,
  GALLERY_CATEGORY_FILTERS,
  galleryFilterForRw,
  type GalleryFilterValue,
} from '@/config/gallery';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';
import { copy } from '@/lib/copy/id';
import { galleryPath } from '@/lib/utils/gallery-search';
import type { RwBadge } from '@/types/rw-unit';

export interface GalleryFilterProps {
  active: GalleryFilterValue | null;
  // The RWs that are online, in their order: one pill each, with its dot, before the categories.
  rws: readonly RwBadge[];
  // `19 foto`, at the end of the row.
  countLabel?: string;
}

// docs/StyleGuide.md §5.11, DESIGN-SPEC §3.7: the pills of `?filter=`, plain links, so the gallery filters without
// script and every filtered view has an address of its own. A new filter starts again at the first page. On a phone
// the row scrolls sideways inside itself.
export function GalleryFilter({ active, rws, countLabel }: GalleryFilterProps) {
  const options = [
    ...rws.map((rw) => ({
      value: galleryFilterForRw(rw.id),
      label: rw.label,
      accentKey: rw.accentKey ?? undefined,
    })),
    ...GALLERY_CATEGORY_FILTER_VALUES.map((value) => ({
      value,
      label: GALLERY_CATEGORY_FILTERS[value].label,
      accentKey: undefined,
    })),
  ];
  return (
    <div className="flex items-center gap-6">
      <nav
        aria-label={copy.gallery.filterLabel}
        className="-mx-5 scrollbar-none flex min-w-0 gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        <FilterChipLink href={galleryPath({ filter: null, page: 1 })} isCurrent={active === null}>
          {catalogueUiCopy.filterAll}
        </FilterChipLink>
        {options.map((option) => (
          <FilterChipLink
            key={option.value}
            href={galleryPath({ filter: option.value, page: 1 })}
            isCurrent={active === option.value}
            accentKey={option.accentKey}
          >
            {option.label}
          </FilterChipLink>
        ))}
      </nav>
      {countLabel ? (
        <p className="ml-auto shrink-0 text-body-sm font-medium max-md:hidden">{countLabel}</p>
      ) : null}
    </div>
  );
}

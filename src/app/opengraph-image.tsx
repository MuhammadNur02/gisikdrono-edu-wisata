import { OG_CONTENT_TYPE, OG_SIZE } from '@/config/og';
import { siteConfig } from '@/config/site';
import { listRwUnits } from '@/lib/queries/rw-units';
import { renderOgImage } from '@/lib/seo/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = siteConfig.name;

// docs/StyleGuide.md §8.4, Task P2.4.13: the default share image of every page without one of its own.
export default async function OpenGraphImage() {
  return renderOgImage({
    eyebrow: `${siteConfig.ownerName} · ${siteConfig.locality.city}`,
    title: siteConfig.name,
    detail: (await listRwUnits()).map((unit) => unit.name).join(' · '),
  });
}

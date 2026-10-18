import { OG_CONTENT_TYPE, OG_SIZE } from '@/config/og';
import { RW_PROGRAMMES } from '@/config/rw';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { getPackageBySlug } from '@/lib/queries/packages';
import { renderOgImage } from '@/lib/seo/og-image';
import { formatIDR } from '@/lib/utils/currency';
import { describePackagePrice } from '@/lib/utils/package-price';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Paket wisata Edu Wisata Gisikdrono';

interface PackageImageProps {
  params: Promise<{ slug: string }>;
}

// docs/StyleGuide.md §8.4, Task P2.4.05: the RW and category, the package name and its price line.
export default async function PackageOpenGraphImage({ params }: PackageImageProps) {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  const price = pkg ? describePackagePrice(pkg) : null;
  return renderOgImage({
    eyebrow: pkg
      ? [
          ...pkg.rwIds.map((rwId) => RW_PROGRAMMES[rwId].label),
          PACKAGE_CATEGORY[pkg.category].label,
        ].join(' · ')
      : 'Paket wisata',
    title: pkg?.name ?? 'Paket wisata',
    detail: price
      ? `${price.isFromPrice ? `${copy.catalogue.fromPrice} ` : ''}${formatIDR(price.amount)} ${copy.catalogue.perBasis[price.basis]}`
      : undefined,
  });
}

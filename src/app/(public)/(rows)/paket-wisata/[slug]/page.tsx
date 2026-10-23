import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RwTag } from '@/components/layout/rw-tag';
import { Photo } from '@/components/marketing/photo';
import { PackageBookingCard } from '@/components/packages/package-booking-card';
import { PackageDetails } from '@/components/packages/package-details';
import { StickyBookingBar } from '@/components/packages/sticky-booking-bar';
import { JsonLd } from '@/components/seo/json-ld';
import { IMAGE_SIZES } from '@/config/images';
import { PACKAGE_CATEGORY } from '@/config/status';
import { publicMediaUrl } from '@/lib/images/public-media';
import { getPackageBySlug, listPackages } from '@/lib/queries/packages';
import { productJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { describePackagePrice } from '@/lib/utils/package-price';
import { packagePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { PackageDetail } from '@/types/package';

export const revalidate = 3600;

interface PackagePageProps {
  params: Promise<{ slug: string }>;
}

// Every published package is prerendered; one published later renders on its first visit (ISR).
export async function generateStaticParams() {
  const packages = await listPackages();
  return packages.map((pkg) => ({ slug: pkg.slug }));
}

export async function generateMetadata({ params }: PackagePageProps): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) return {};
  return buildPageMetadata({
    title: pkg.name,
    description: pkg.tagline ?? undefined,
    path: packagePath(pkg.slug),
  });
}

function packageJsonLd(pkg: PackageDetail) {
  const price = describePackagePrice(pkg);
  return productJsonLd({
    name: pkg.name,
    description: pkg.tagline ?? undefined,
    path: packagePath(pkg.slug),
    imageUrls: pkg.images.map((image) => publicMediaUrl(image.path)),
    offer: { priceIdr: price?.amount ?? 0, path: packagePath(pkg.slug), isAvailable: true },
  });
}

function PackageEyebrow({ pkg }: { pkg: PackageDetail }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {pkg.rws.map((rw) => (
        <RwTag key={rw.id} rw={rw} />
      ))}
      {PACKAGE_CATEGORY[pkg.category].label}
    </span>
  );
}

// docs/PRD.md FR-PUB-12, Task P2.4.05.
export default async function PackagePage({ params }: PackagePageProps) {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) notFound();
  return (
    <>
      <PageHeader
        eyebrow={<PackageEyebrow pkg={pkg} />}
        title={pkg.name}
        description={pkg.tagline ?? undefined}
        breadcrumbs={[{ name: 'Paket wisata', path: PUBLIC_PATHS.packages }]}
        path={packagePath(pkg.slug)}
      />
      {/* pb-28 leaves room under the content for the sticky bar below md. */}
      <Container className="grid gap-10 pb-28 md:pb-24 lg:grid-cols-3">
        {/* The photo sits beside the booking card, so a package with little text leaves no empty column. */}
        <div className="space-y-12 lg:col-span-2">
          <Photo
            image={pkg.cover}
            caption={pkg.name}
            placeholder={{ icon: PACKAGE_CATEGORY[pkg.category].icon, rws: pkg.rws }}
            sizes={IMAGE_SIZES.main}
            aspectClassName="aspect-4/3 md:aspect-video"
            priority
          />
          <PackageDetails pkg={pkg} />
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <PackageBookingCard pkg={pkg} />
        </div>
      </Container>
      <StickyBookingBar pkg={pkg} />
      <JsonLd data={packageJsonLd(pkg)} />
    </>
  );
}

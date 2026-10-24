import { FileDown } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { Breadcrumbs } from '@/components/layout/page-header';
import { RwComboTag, RwTag } from '@/components/layout/rw-tag';
import { Section } from '@/components/layout/section';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { ShareButton } from '@/components/marketing/share-button';
import { PackageBookingCard } from '@/components/packages/package-booking-card';
import { PackageCard } from '@/components/packages/package-card';
import { PackageDetails } from '@/components/packages/package-details';
import { PackageGallery } from '@/components/packages/package-gallery';
import { StickyBookingBar } from '@/components/packages/sticky-booking-bar';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { rwAccentClasses } from '@/config/rw';
import { PACKAGE_CATEGORY } from '@/config/status';
import { packageDetailCopy as text } from '@/lib/copy/catalogue';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { listBooklets } from '@/lib/queries/booklets';
import { getPackageBySlug, listPackages } from '@/lib/queries/packages';
import { listRwUnits } from '@/lib/queries/rw-units';
import { breadcrumbListJsonLd, productJsonLd } from '@/lib/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { breadcrumbTrail } from '@/lib/utils/breadcrumbs';
import { describePackagePrice } from '@/lib/utils/package-price';
import { bookletDownloadPath, packagePath, PUBLIC_PATHS } from '@/lib/utils/paths';
import type { BookletSummary } from '@/types/booklet';
import type { PackageDetail, PackageSummary } from '@/types/package';
import type { RwUnitSummary } from '@/types/rw-unit';

export const revalidate = 3600;

// DESIGN-SPEC §3.5 "Paket lain": the packages beside this one, at most three.
const OTHER_PACKAGES = 3;

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

// A package without a price in the catalogue carries no Offer, never one priced at 0, and a tiered "mulai dari"
// price is the low end of an AggregateOffer (Task P5.6.02).
function packageJsonLd(pkg: PackageDetail) {
  const price = describePackagePrice(pkg);
  const path = packagePath(pkg.slug);
  return productJsonLd({
    name: pkg.name,
    description: pkg.tagline ?? undefined,
    path,
    imageUrls: pkg.images.map((image) => publicMediaUrl(image.path)),
    offer: price
      ? { priceIdr: price.amount, path, isAvailable: true, isFromPrice: price.isFromPrice }
      : undefined,
  });
}

function unitsOf(pkg: PackageSummary, rws: readonly RwUnitSummary[]): RwUnitSummary[] {
  return pkg.rws.flatMap((visit) => rws.filter((rw) => rw.id === visit.id));
}

// The proposal a school hands its treasurer: the published visit proposal of this package's RW, or of the kelurahan.
function proposalFor(
  pkg: PackageSummary,
  booklets: readonly BookletSummary[],
): BookletSummary | null {
  const proposals = booklets.filter((booklet) => booklet.kind === 'visit_proposal');
  return (
    proposals.find((booklet) => booklet.rw && pkg.rws.some((rw) => rw.id === booklet.rw?.id)) ??
    proposals.find((booklet) => booklet.rw === null) ??
    null
  );
}

// The badges over the title (DESIGN-SPEC §3.5): the RW with its programme, or the combination; the group; the length.
function TitleBadges({ pkg, units }: { pkg: PackageDetail; units: readonly RwUnitSummary[] }) {
  const [onlyUnit] = units;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {units.length === 1 && onlyUnit ? (
        <RwTag rw={onlyUnit} detail={onlyUnit.shortName} />
      ) : (
        <RwComboTag rws={pkg.rws} />
      )}
      <Badge variant="tag">{PACKAGE_CATEGORY[pkg.category].label}</Badge>
      {pkg.durationMinutes ? (
        <Badge variant="tag">{copy.catalogue.minutes(pkg.durationMinutes)}</Badge>
      ) : null}
    </div>
  );
}

interface TitleBlockProps {
  pkg: PackageDetail;
  units: readonly RwUnitSummary[];
  proposal: BookletSummary | null;
}

// The title block (DESIGN-SPEC §3.5): the trail, the badges, the H1 (the page's LCP with the main photo, never
// animated on load), the tagline, and on the right `Bagikan` and `Unduh proposal`.
function TitleBlock({ pkg, units, proposal }: TitleBlockProps) {
  const trail = breadcrumbTrail([{ name: 'Paket wisata', path: PUBLIC_PATHS.packages }], {
    name: pkg.name,
    path: packagePath(pkg.slug),
  });
  return (
    <Container className="space-y-5 pt-6 pb-6 md:pt-10 md:pb-8">
      <Breadcrumbs trail={trail} />
      <TitleBadges pkg={pkg} units={units} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-200 space-y-3">
          <h1 className="text-display text-balance">{pkg.name}</h1>
          {pkg.tagline ? <p className="text-body-lg text-ink-2 md:text-xl">{pkg.tagline}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 max-lg:-ml-5">
          <ShareButton title={pkg.name} />
          {proposal ? (
            <Button asChild variant="ghost">
              <a href={bookletDownloadPath(proposal.id)}>
                {text.downloadProposal}
                <FileDown aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <JsonLd data={breadcrumbListJsonLd(trail)} />
    </Container>
  );
}

function GalleryOrPlaceholder({ pkg }: { pkg: PackageDetail }) {
  if (pkg.images.length > 0) return <PackageGallery images={pkg.images} name={pkg.name} />;
  return (
    <PhotoPlaceholder
      label={pkg.name}
      icon={PACKAGE_CATEGORY[pkg.category].icon}
      rws={pkg.rws}
      iconClassName="size-12"
      className="h-56 md:h-80 lg:h-100"
    />
  );
}

function OtherPackages({ packages }: { packages: readonly PackageSummary[] }) {
  if (packages.length === 0) return null;
  return (
    <Section
      id="paket-lain"
      tone="muted"
      eyebrow={text.otherEyebrow}
      title={text.otherTitle}
      size="compact"
    >
      <ul className="grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((other) => (
          <li key={other.id} className="flex">
            <PackageCard pkg={other} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface PackageBodyProps {
  pkg: PackageDetail;
  units: readonly RwUnitSummary[];
  proposal: BookletSummary | null;
}

// The title block, the gallery, then the sections beside the sticky booking panel (on phones the panel comes first).
// The subtree takes the package's RW colours (the combination the brick), so the checks, the itinerary and the tags
// speak its kampung.
function PackageBody({ pkg, units, proposal }: PackageBodyProps) {
  const [onlyUnit] = units;
  const scope =
    units.length === 1 && onlyUnit ? rwAccentClasses(onlyUnit.accentKey).scope : 'rw-scope-combo';
  return (
    <div className={scope}>
      <TitleBlock pkg={pkg} units={units} proposal={proposal} />
      <Container>
        <GalleryOrPlaceholder pkg={pkg} />
      </Container>
      {/* pb-28 leaves room under the content for the sticky bar below md (DESIGN-SPEC §3.5). */}
      <Container className="flex flex-col gap-12 pt-8 pb-28 md:pb-24 lg:flex-row lg:items-start lg:gap-16 lg:pt-14">
        <div className="min-w-0 flex-1">
          <PackageDetails pkg={pkg} />
        </div>
        <div className="max-lg:order-first lg:sticky lg:top-24 lg:w-105 lg:shrink-0">
          <PackageBookingCard pkg={pkg} rwNames={units.map((unit) => unit.name)} />
        </div>
      </Container>
    </div>
  );
}

// docs/PRD.md FR-PUB-12, Task P2.4.05, DESIGN-SPEC §3.5.
export default async function PackagePage({ params }: PackagePageProps) {
  const { slug } = await params;
  const [pkg, rws, packages, booklets] = await Promise.all([
    getPackageBySlug(slug),
    listRwUnits(),
    listPackages(),
    listBooklets(),
  ]);
  if (!pkg) notFound();
  const others = packages.filter((other) => other.id !== pkg.id).slice(0, OTHER_PACKAGES);
  return (
    <>
      <PackageBody pkg={pkg} units={unitsOf(pkg, rws)} proposal={proposalFor(pkg, booklets)} />
      <OtherPackages packages={others} />
      <StickyBookingBar pkg={pkg} />
      <JsonLd data={packageJsonLd(pkg)} />
    </>
  );
}

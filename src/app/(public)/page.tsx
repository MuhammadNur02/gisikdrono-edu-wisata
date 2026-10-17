import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { PageHeader } from '@/components/layout/page-header';
import { RwEyebrow } from '@/components/layout/rw-eyebrow';
import { Section } from '@/components/layout/section';
import { Photo } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { RW_IDS, RW_PROGRAMMES, type RwId } from '@/config/rw';
import { siteConfig } from '@/config/site';
import { listHeroBanners } from '@/lib/queries/banners';
import { listGalleryPage } from '@/lib/queries/galleries';
import type { GalleryItem } from '@/types/gallery';

export const revalidate = 3600;

export const metadata: Metadata = { alternates: { canonical: '/' } };

// A holding page until the home sections of Task P2.4.01. The activities named here are the programmes as
// docs/PRD.md §1 describes them; the photos are the CMS's own (the first hero banner and each RW's first
// gallery item), and a slot without one says Foto menyusul.
const RW_ACTIVITIES: Record<RwId, string> = {
  5: 'Bank Sampah, pengomposan, budidaya maggot, urban farming, dan kerajinan daur ulang buatan ibu-ibu PKK.',
  8: 'Tari tradisional, sanggar seni anak, dan dolanan, permainan tradisional anak Jawa.',
};

async function firstRwPhoto(rwId: RwId): Promise<GalleryItem | null> {
  const page = await listGalleryPage({ owner: rwId });
  return page.items[0] ?? null;
}

async function RwProgrammeBlock({ rwId }: { rwId: RwId }) {
  const programme = RW_PROGRAMMES[rwId];
  const photo = await firstRwPhoto(rwId);
  return (
    <article className="grid gap-5 sm:grid-cols-5 sm:items-center">
      <Photo
        image={photo?.image ?? null}
        caption={photo?.caption ?? `Kegiatan ${programme.label} ${programme.name}`}
        sizes={IMAGE_SIZES.card}
        aspectClassName="aspect-4/3"
        className="sm:col-span-2"
      />
      <div className="space-y-3 sm:col-span-3">
        <RwEyebrow rwId={rwId} withName />
        <h3 className="text-h3">{programme.name}</h3>
        <p className="text-body text-muted-foreground">{RW_ACTIVITIES[rwId]}</p>
        <Link
          href={programme.path}
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-body-sm font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Lihat halaman {programme.label}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const [banner] = await listHeroBanners();
  return (
    <>
      <PageHeader
        eyebrow={`${siteConfig.ownerName} · Semarang Barat`}
        title={siteConfig.name}
        description="Kunjungan edukasi untuk sekolah, kampus, instansi, perusahaan, dan keluarga ke dua kampung di Kelurahan Gisikdrono. Halaman lengkapnya sedang kami siapkan."
      />
      <Container>
        <Photo
          image={banner?.image ?? null}
          caption={banner?.title ?? 'Kegiatan di Kelurahan Gisikdrono'}
          sizes={IMAGE_SIZES.hero}
          aspectClassName="aspect-video"
          priority
        />
      </Container>
      <Section
        id="program"
        eyebrow="Dua kampung, dua program"
        title="Pilih kampung yang ingin Anda kunjungi"
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
          {RW_IDS.map((rwId) => (
            <RwProgrammeBlock key={rwId} rwId={rwId} />
          ))}
        </div>
      </Section>
    </>
  );
}

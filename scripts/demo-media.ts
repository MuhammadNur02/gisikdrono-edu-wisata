import { readdirSync, readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { seedDemoBooklet } from './demo-booklet';
import { runSql, sqlText, uploadToLocalBucket } from './local-stack';
import { reencodeImage } from '../src/lib/images/re-encode';

// pnpm db:seed --media <folder>: real Gisikdrono photos for the local demo content (decision of 2026-10-18).
// The photos themselves never enter the repository: faces are in them and the consent is still being
// arranged. Only their file names and the descriptions below live here. Each photo goes through
// reencodeImage, the step api/uploads/finalize uses, so the local site shows exactly what an upload becomes.
// Without --media the seed writes no hero banner, no gallery rows and no e-booklet, and the pages show
// `Foto menyusul`.

interface DemoPhoto {
  // The file name in the folder, without its extension.
  file: string;
  id: string;
  altText: string;
  caption: string;
}

const PUBLIC_MEDIA_BUCKET = 'public-media';
const WEBP_TYPE = 'image/webp';
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Descriptions say only what the photo shows; the place names are on the signs in the photos themselves.
// hero_banners has no alt text or caption of its own: the subtitle says what the photo shows (G8) and is
// also its alt text (src/lib/queries/banners.ts).
const HERO_PHOTO: Pick<DemoPhoto, 'file' | 'id'> & { title: string; subtitle: string } = {
  file: 'IMG_7571',
  id: '0de00000-0000-4000-8000-0000000000e1',
  // The home hero speaks for both kampung (decision of 2026-10-18); the subtitle stays with this photo.
  title: 'Belajar mengolah sampah dan mengenal seni budaya di dua kampung Gisikdrono',
  subtitle: 'Rombongan tamu mendengarkan pemaparan di halaman beratap tanaman rambat, RW 05.',
};

// Which uploaded photo stands for the RW 05 page and for each RW 05 activity point of seed-dev.sql.
const RW05_PROFILE_PHOTO_ID = '0de00000-0000-4000-8000-0000000000f1';
const POINT_PHOTO_IDS: Record<string, string> = {
  'taman-toga-sumber-saras': '0de00000-0000-4000-8000-0000000000f2',
  'bank-sampah-sumber-rejeki': '0de00000-0000-4000-8000-0000000000f6',
};

const RW05_GALLERY: DemoPhoto[] = [
  {
    file: 'IMG_7605',
    id: '0de00000-0000-4000-8000-0000000000f1',
    altText:
      'Mahasiswa berkaus biru dan berjas merah berfoto bersama warga di depan papan Taman TOGA Sumber Saras RW 05 Gisikdrono',
    caption: 'Foto bersama di depan Taman TOGA Sumber Saras',
  },
  {
    file: 'IMG_7595',
    id: '0de00000-0000-4000-8000-0000000000f2',
    altText:
      'Rombongan berkaus biru berjalan di bawah paranet, di antara tanaman dalam pot dari botol plastik bekas',
    caption: 'Menyusuri tanaman di Taman TOGA',
  },
  {
    file: 'IMG_7615',
    id: '0de00000-0000-4000-8000-0000000000f3',
    altText: 'Mahasiswa berkaus biru mengangkat gelas plastik berisi minuman berwarna merah muda',
    caption: 'Mengangkat gelas minuman berwarna merah muda',
  },
  {
    file: 'IMG_7648',
    id: '0de00000-0000-4000-8000-0000000000f4',
    altText:
      'Dua perempuan di depan spanduk selamat datang Bank Sampah Sumber Rejeki, satu memegang sertifikat dan satu memegang tas',
    caption: 'Sertifikat dan tas di depan spanduk Bank Sampah Sumber Rejeki',
  },
  {
    file: 'IMG_7635',
    id: '0de00000-0000-4000-8000-0000000000f5',
    altText:
      'Seorang perempuan berbicara dengan mikrofon di halaman beratap tanaman rambat, di samping dua orang berkaus hijau bertuliskan RW 05',
    caption: 'Berbicara dengan mikrofon di bawah atap tanaman rambat',
  },
  {
    file: 'IMG_7622',
    id: '0de00000-0000-4000-8000-0000000000f6',
    altText:
      'Peserta duduk mendengarkan seorang pembicara bermikrofon di depan spanduk Bank Sampah Sumber Rejeki',
    caption: 'Mendengarkan pemaparan di Bank Sampah Sumber Rejeki',
  },
];

// pnpm passes a `--` through when the caller writes one, so it is dropped before parsing.
export function mediaFolderFromArgs(args: string[]): string | undefined {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    options: { media: { type: 'string' } },
  });
  return values.media;
}

// Camera files differ in case (IMG_7571.JPG, img_7571.jpg); the folder is matched by name, not spelling.
function findPhotoFile(folder: string, name: string): string {
  const match = readdirSync(folder).find((entry) => {
    const { name: base, ext } = parse(entry);
    return base.toLowerCase() === name.toLowerCase() && PHOTO_EXTENSIONS.has(ext.toLowerCase());
  });
  if (!match) throw new Error(`--media: ${name} is not in ${folder}`);
  return join(folder, match);
}

interface UploadedPhoto {
  path: string;
  width: number;
  height: number;
  blurhash: string;
}

async function uploadPhoto(
  folder: string,
  photo: Pick<DemoPhoto, 'file'>,
  path: string,
): Promise<UploadedPhoto> {
  const image = await reencodeImage(readFileSync(findPhotoFile(folder, photo.file)));
  await uploadToLocalBucket(PUBLIC_MEDIA_BUCKET, path, image.webp, WEBP_TYPE);
  return { path, width: image.width, height: image.height, blurhash: image.blurhash };
}

async function seedHeroBanner(folder: string): Promise<void> {
  const uploaded = await uploadPhoto(folder, HERO_PHOTO, `kelurahan/hero/${HERO_PHOTO.id}.webp`);
  // The texts follow this file, so a database seeded before they changed catches up on the next run.
  await runSql(`insert into public.hero_banners (id, title, subtitle, cta_label, cta_href, image_path,
      sort_order)
    values (${sqlText(HERO_PHOTO.id)}, ${sqlText(HERO_PHOTO.title)}, ${sqlText(HERO_PHOTO.subtitle)},
            'Pesan Kunjungan', '/paket-wisata', ${sqlText(uploaded.path)}, 0)
    on conflict (id) do update set title = excluded.title, subtitle = excluded.subtitle,
      cta_label = excluded.cta_label, cta_href = excluded.cta_href`);
}

function galleryPath(photoId: string): string {
  return `rw-05/gallery/${photoId}.webp`;
}

function galleryPhoto(photoId: string): DemoPhoto {
  const photo = RW05_GALLERY.find((candidate) => candidate.id === photoId);
  if (!photo) throw new Error(`no demo photo ${photoId}`);
  return photo;
}

async function idOfSlug(
  table: 'activity_points' | 'articles',
  slug: string,
): Promise<string | null> {
  const rows = z
    .array(z.object({ id: z.string() }))
    .parse(await runSql(`select id from public.${table} where slug = ${sqlText(slug)}`));
  return rows[0]?.id ?? null;
}

// The RW 05 page shows a gallery photo, which its rule allows; an activity point keeps a copy of its own in its own
// folder, as the CMS and the database require (supabase/migrations/20261021090100_content_media_paths.sql). A value
// someone already set is kept.
async function linkRw05Photos(folder: string): Promise<void> {
  await runSql(`update public.rw_units set hero_image_path = ${sqlText(galleryPath(RW05_PROFILE_PHOTO_ID))}
      where id = 5 and hero_image_path is null`);
  for (const [slug, photoId] of Object.entries(POINT_PHOTO_IDS)) {
    const pointId = await idOfSlug('activity_points', slug);
    if (!pointId) continue;
    const path = `rw-05/activity-points/${pointId}/${photoId}.webp`;
    await uploadPhoto(folder, galleryPhoto(photoId), path);
    await runSql(`update public.activity_points set image_path = ${sqlText(path)}
      where id = ${sqlText(pointId)} and image_path is null`);
  }
}

// The RW 05 article of seed-dev.sql gets the group photo as its cover and, after its Bank Sampah section, the
// photo of that talk with the gallery's own alt text and caption. A body that already holds a photo is left
// as it is, so a second run adds nothing.
const ARTICLE_SLUG = 'bank-sampah-dan-taman-toga-rw-05';
const ARTICLE_COVER_PHOTO_ID = '0de00000-0000-4000-8000-0000000000f1';
const ARTICLE_BODY_PHOTO_ID = '0de00000-0000-4000-8000-0000000000f6';

// Both photos are copies in the article's own folder, as the CMS and the database require.
async function linkArticlePhotos(folder: string): Promise<void> {
  const articleId = await idOfSlug('articles', ARTICLE_SLUG);
  if (!articleId) return;
  const articleFolder = `rw-05/articles/${articleId}`;
  const cover = await uploadPhoto(
    folder,
    galleryPhoto(ARTICLE_COVER_PHOTO_ID),
    `${articleFolder}/${ARTICLE_COVER_PHOTO_ID}.webp`,
  );
  const bodyPhoto = galleryPhoto(ARTICLE_BODY_PHOTO_ID);
  const body = await uploadPhoto(
    folder,
    bodyPhoto,
    `${articleFolder}/${ARTICLE_BODY_PHOTO_ID}.webp`,
  );
  await runSql(`update public.articles set cover_path = ${sqlText(cover.path)}
      where id = ${sqlText(articleId)} and cover_path is null;
    update public.articles
    set body_json = jsonb_set(body_json, '{content}', (body_json -> 'content') || jsonb_build_array(
      jsonb_build_object('type', 'image', 'attrs', jsonb_build_object('src', ${sqlText(body.path)},
        'alt', ${sqlText(bodyPhoto.altText)}, 'title', ${sqlText(bodyPhoto.caption)},
        'width', ${String(body.width)}, 'height', ${String(body.height)}))))
    where id = ${sqlText(articleId)} and not body_json @> '{"content": [{"type": "image"}]}';`);
}

async function seedGalleryPhoto(
  folder: string,
  photo: DemoPhoto,
  sortOrder: number,
): Promise<void> {
  const uploaded = await uploadPhoto(folder, photo, galleryPath(photo.id));
  await runSql(`insert into public.galleries (id, rw_id, category, storage_path, width, height, blurhash,
      alt_text, caption, status, sort_order)
    values (${sqlText(photo.id)}, 5, 'visit', ${sqlText(uploaded.path)}, ${String(uploaded.width)},
            ${String(uploaded.height)}, ${sqlText(uploaded.blurhash)}, ${sqlText(photo.altText)},
            ${sqlText(photo.caption)}, 'published', ${String(sortOrder)})
    on conflict (id) do nothing`);
}

// The file goes up before its row, so no row ever points at a missing file. Running it again uploads the
// same files over themselves and keeps the rows as they are.
export async function seedDemoMedia(folder: string): Promise<number> {
  await seedHeroBanner(folder);
  for (const [index, photo] of RW05_GALLERY.entries()) {
    await seedGalleryPhoto(folder, photo, index + 1);
  }
  await linkRw05Photos(folder);
  await linkArticlePhotos(folder);
  await seedDemoBooklet(RW05_GALLERY.map((photo) => findPhotoFile(folder, photo.file)));
  return RW05_GALLERY.length + 1;
}

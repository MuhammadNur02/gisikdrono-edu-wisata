import { readdirSync, readFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { parseArgs } from 'node:util';

import { runSql, sqlText, uploadToLocalBucket } from './local-stack';
import { reencodeImage } from '../src/lib/images/re-encode';

// pnpm db:seed --media <folder>: real Gisikdrono photos for the local demo content (decision of 2026-10-18).
// The photos themselves never enter the repository: faces are in them and the consent is still being
// arranged. Only their file names and the descriptions below live here. Each photo goes through
// reencodeImage, the step api/uploads/finalize uses, so the local site shows exactly what an upload becomes.
// Without --media the seed writes no hero banner and no gallery rows, and the pages show `Foto menyusul`.

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
// hero_banners has no alt text or caption of its own: the title is both.
const HERO_PHOTO: Pick<DemoPhoto, 'file' | 'id'> & { title: string } = {
  file: 'IMG_7571',
  id: '0de00000-0000-4000-8000-0000000000e1',
  title: 'Rombongan tamu mendengarkan pemaparan di halaman beratap tanaman rambat, RW 05',
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
  await runSql(`insert into public.hero_banners (id, title, cta_label, cta_href, image_path, sort_order)
    values (${sqlText(HERO_PHOTO.id)}, ${sqlText(HERO_PHOTO.title)}, 'Lihat Paket', '/paket-wisata',
            ${sqlText(uploaded.path)}, 0)
    on conflict (id) do nothing`);
}

async function seedGalleryPhoto(
  folder: string,
  photo: DemoPhoto,
  sortOrder: number,
): Promise<void> {
  const uploaded = await uploadPhoto(folder, photo, `rw-05/gallery/${photo.id}.webp`);
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
  return RW05_GALLERY.length + 1;
}

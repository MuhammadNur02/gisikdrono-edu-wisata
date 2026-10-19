import { readFileSync } from 'node:fs';

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

import { runSql, sqlText, uploadToLocalBucket } from './local-stack';
import { reencodeImage } from '../src/lib/images/re-encode';
import { bookletPageFileName, bookletPagesFolder, bookletPdfPath } from '../src/lib/uploads/paths';

// pnpm db:seed --media <folder>: one local e-booklet so the flipbook and the download route have something real
// to show (Tasks P2.7.01, P2.4.08). It holds nothing but the RW 05 development photos, one per page, so its
// title and description say only that. The pages go through reencodeImage like any upload, and the PDF holds
// the same photos, so the download and the pages always match. Never written to staging or production.

const BOOKLET = {
  id: '0de00000-0000-4000-8000-0000000000b5',
  slug: 'foto-kunjungan-rw-05',
  title: 'Foto Kunjungan RW 05',
  description:
    'Foto rombongan yang berkunjung ke Bank Sampah Sumber Rejeki dan Taman TOGA Sumber Saras, RW 05.',
} as const;
const RW_ID = 5;
const PUBLIC_MEDIA_BUCKET = 'public-media';
const WEBP_TYPE = 'image/webp';
const PDF_TYPE = 'application/pdf';
// A PDF page is measured in points: 72 per inch, against the 96 CSS pixels a page image is drawn for.
const POINTS_PER_INCH = 72;
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_PIXEL = POINTS_PER_INCH / CSS_PIXELS_PER_INCH;
const PDF_JPEG_QUALITY = 80;

async function addPdfPage(pdf: PDFDocument, webp: Buffer, width: number, height: number) {
  const jpeg = await sharp(webp).jpeg({ quality: PDF_JPEG_QUALITY }).toBuffer();
  const image = await pdf.embedJpg(jpeg);
  const page = pdf.addPage([width * POINTS_PER_PIXEL, height * POINTS_PER_PIXEL]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
}

// Uploads every page and returns the PDF built from them.
async function uploadPages(photoFiles: readonly string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagesFolder = bookletPagesFolder(RW_ID, BOOKLET.id);
  for (const [index, file] of photoFiles.entries()) {
    const page = await reencodeImage(readFileSync(file));
    const path = `${pagesFolder}/${bookletPageFileName(index + 1)}`;
    await uploadToLocalBucket(PUBLIC_MEDIA_BUCKET, path, page.webp, WEBP_TYPE);
    await addPdfPage(pdf, page.webp, page.width, page.height);
  }
  return pdf.save();
}

// The files go up before the row, so the row never points at a missing file; a second run uploads the same
// files over themselves and keeps the row.
export async function seedDemoBooklet(photoFiles: readonly string[]): Promise<void> {
  const pdfBytes = await uploadPages(photoFiles);
  const pdfPath = bookletPdfPath(RW_ID, BOOKLET.id);
  await uploadToLocalBucket(PUBLIC_MEDIA_BUCKET, pdfPath, Buffer.from(pdfBytes), PDF_TYPE);
  const pagesFolder = bookletPagesFolder(RW_ID, BOOKLET.id);
  await runSql(`insert into public.booklets (id, rw_id, kind, slug, title, description, pdf_path, cover_path,
      page_images_prefix, page_count, file_size_bytes, status, published_at)
    values (${sqlText(BOOKLET.id)}, ${String(RW_ID)}, 'ebooklet', ${sqlText(BOOKLET.slug)},
            ${sqlText(BOOKLET.title)}, ${sqlText(BOOKLET.description)}, ${sqlText(pdfPath)},
            ${sqlText(`${pagesFolder}/${bookletPageFileName(1)}`)}, ${sqlText(pagesFolder)},
            ${String(photoFiles.length)}, ${String(pdfBytes.byteLength)}, 'published', now())
    on conflict (id) do nothing`);
}

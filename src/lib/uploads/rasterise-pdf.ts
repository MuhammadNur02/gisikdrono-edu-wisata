import { MAX_IMAGE_EDGE_PX } from '@/config/uploads';

// Draws each page of a booklet PDF in the staff member's browser with pdf.js (Task P2.9.02), at 1600 px on the
// long edge, the size the flipbook shows (docs/StyleGuide.md §5.12). pdf.js runs in its own worker and never
// executes the file's scripts or forms; the server has already scanned the PDF before this runs, and every page
// image still goes through finalize's re-encode like any photo.

const PAGE_WEBP_QUALITY = 0.9;

export interface RenderedPage {
  number: number;
  total: number;
  image: Blob;
}

// The zoom that brings a page's long edge to 1600 px, whatever its size in points.
export function pageScale(width: number, height: number): number {
  return MAX_IMAGE_EDGE_PX / Math.max(width, height);
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('page could not be encoded'));
      },
      'image/webp',
      PAGE_WEBP_QUALITY,
    );
  });
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  );
  return pdfjs;
}

export async function* renderPdfPages(file: Blob): AsyncGenerator<RenderedPage> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pageScale(width, height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      yield { number, total: pdf.numPages, image: await canvasToWebp(canvas) };
    }
  } finally {
    await loadingTask.destroy();
  }
}

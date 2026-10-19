import { handWrittenPdf, pdfFromObjects, pdfObject } from './pdf';

// Booklets carrying what the published copy must leave out (docs/Security.md §8.4; security review of PR #14, L4,
// N1 and N2): document metadata, an application's private data, page thumbnails, orphan objects and comments,
// wherever they hide. `needles` are strings found only in what must go; `comments` is how many comments the scan
// must report removed. pdf-metadata.test.ts checks every needle is gone from the copy; pdf-cleanup-control.test.ts
// checks every needle is still there once the cleanup is switched off, so the first test cannot pass by accident.

export type PrivateDataCase = {
  name: string;
  pdf: () => Buffer;
  needles: string[];
  comments: number;
};

const XMP =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<dc:creator>Pak Budi</dc:creator><exif:GPSLatitude>6,58.0S</exif:GPSLatitude></x:xmpmeta>';
const LINK = '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest [3 0 R /Fit] >>';
const NOTE =
  '<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /T (Pak Budi) /Contents (catatan rahasia) >>';
const PIECE_INFO = '<< /Illustrator << /Private (C:/Users/desainer/booklet.ai) >> >>';

function xmpStream(objectNumber: number): string {
  return pdfObject(
    objectNumber,
    `<< /Type /Metadata /Subtype /XML /Length ${String(XMP.length)} >>\nstream\n${XMP}\nendstream`,
  );
}

const thumbnail = pdfObject(
  4,
  '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 9 >>\nstream\nTHUMBDATA\nendstream',
);

// A one-page booklet whose page lists `annots` and whose catalog carries `catalogExtra`, with objects from 4 on.
function bookletWith(annots: string, objects: string[], catalogExtra = ''): Buffer {
  return pdfFromObjects([
    pdfObject(1, `<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>`),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Annots [${annots}] >>`),
    ...objects,
  ]);
}

export const PRIVATE_DATA_CASES: PrivateDataCase[] = [
  {
    name: 'the document information dictionary',
    pdf: () =>
      handWrittenPdf(
        '',
        [
          pdfObject(
            4,
            '<< /Author (Pak Budi) /Creator (Penyunting-Lama) /Keywords (draf-internal) >>',
          ),
        ],
        '/Info 4 0 R ',
      ),
    needles: ['Pak Budi', 'Penyunting-Lama', 'draf-internal'],
    comments: 0,
  },
  {
    name: 'XMP on the catalog, on an image and one left without a reference',
    pdf: () =>
      handWrittenPdf('/Metadata 4 0 R', [
        xmpStream(4),
        pdfObject(
          5,
          '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Metadata 6 0 R /Length 1 >>\nstream\n\u0000\nendstream',
        ),
        xmpStream(6),
        xmpStream(7),
      ]),
    needles: ['xmpmeta', 'GPSLatitude', 'Pak Budi'],
    comments: 0,
  },
  {
    name: '/PieceInfo on the catalog',
    pdf: () => handWrittenPdf(`/PieceInfo ${PIECE_INFO}`),
    needles: ['desainer', 'Illustrator'],
    comments: 0,
  },
  {
    name: '/PieceInfo on a page',
    pdf: () => handWrittenPdf('', [], '', `/PieceInfo ${PIECE_INFO} `),
    needles: ['desainer', 'Illustrator'],
    comments: 0,
  },
  {
    name: '/PieceInfo under an escape pdf-lib keeps',
    pdf: () => handWrittenPdf(`/PieceI#6efo ${PIECE_INFO}`),
    needles: ['desainer', 'Illustrator'],
    comments: 0,
  },
  {
    name: 'a page thumbnail',
    pdf: () => handWrittenPdf('', [thumbnail], '', '/Thumb 4 0 R '),
    needles: ['THUMBDATA'],
    comments: 0,
  },
  {
    name: 'a page thumbnail under an escape pdf-lib keeps',
    pdf: () => handWrittenPdf('', [thumbnail], '', '/Thu#6db 4 0 R '),
    needles: ['THUMBDATA'],
    comments: 0,
  },
  {
    // Security review of PR #14, F5.
    name: 'a page’s /LastModified date',
    pdf: () => handWrittenPdf('', [], '', '/LastModified (D:20261018093000+07) '),
    needles: ['D:20261018093000'],
    comments: 0,
  },
  {
    name: 'an object nothing refers to',
    pdf: () =>
      handWrittenPdf('', [pdfObject(4, '<< /Draft (sisa draf lama: harga belum final) >>')]),
    needles: ['sisa draf'],
    comments: 0,
  },
  {
    name: 'a sticky note and its popup next to a link',
    pdf: () =>
      bookletWith('4 0 R 5 0 R 6 0 R', [
        pdfObject(4, LINK),
        pdfObject(
          5,
          '<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /T (Pak Budi) /Contents (catatan rahasia) /Popup 6 0 R >>',
        ),
        pdfObject(6, '<< /Type /Annot /Subtype /Popup /Rect [0 0 10 10] /Parent 5 0 R >>'),
      ]),
    needles: ['Pak Budi', 'catatan rahasia'],
    comments: 2,
  },
  {
    name: 'a highlight alone on its page',
    pdf: () =>
      bookletWith('4 0 R', [
        pdfObject(4, '<< /Type /Annot /Subtype /Highlight /Rect [0 0 10 10] /T (Bu Sri) >>'),
      ]),
    needles: ['Bu Sri'],
    comments: 1,
  },
  {
    name: 'a note the structure tree of a tagged PDF points at',
    pdf: () =>
      bookletWith(
        '4 0 R',
        [
          pdfObject(4, NOTE),
          pdfObject(5, '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 6 0 R] >> >>'),
          pdfObject(
            6,
            '<< /Type /StructElem /S /Annot /P 5 0 R /Pg 3 0 R /K [<< /Type /OBJR /Obj 4 0 R >> 7 0 R] >>',
          ),
          pdfObject(7, '<< /Type /OBJR /Obj 4 0 R /Pg 3 0 R >>'),
        ],
        '/StructTreeRoot 5 0 R /MarkInfo << /Marked true >>',
      ),
    needles: ['Pak Budi', 'catatan rahasia'],
    comments: 1,
  },
  {
    name: 'a note only a link’s /Popup points at',
    pdf: () =>
      bookletWith('5 0 R', [
        pdfObject(4, NOTE),
        pdfObject(
          5,
          '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /Dest [3 0 R /Fit] /Popup 4 0 R >>',
        ),
      ]),
    needles: ['Pak Budi', 'catatan rahasia'],
    comments: 1,
  },
  {
    name: 'a reply that reaches its note through /IRT',
    pdf: () =>
      bookletWith('4 0 R', [
        pdfObject(4, NOTE),
        pdfObject(
          5,
          '<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /T (Bu Sri) /Contents (balasan internal) /IRT 4 0 R >>',
        ),
      ]),
    needles: ['Pak Budi', 'catatan rahasia', 'Bu Sri', 'balasan internal'],
    comments: 2,
  },
  {
    name: 'a note written in place, without /Type or /Rect',
    pdf: () => bookletWith('<< /Subtype /Text /Contents (catatan di tempat) >>', []),
    needles: ['catatan di tempat'],
    comments: 1,
  },
  {
    name: 'a note’s own appearance stream',
    pdf: () =>
      bookletWith('4 0 R', [
        pdfObject(
          4,
          '<< /Type /Annot /Subtype /FreeText /Rect [0 0 10 10] /Contents (teks bebas) /AP << /N 5 0 R >> >>',
        ),
        pdfObject(
          5,
          '<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /Length 13 >>\nstream\nTEKS-TAMPILAN\nendstream',
        ),
      ]),
    needles: ['teks bebas', 'TEKS-TAMPILAN'],
    comments: 1,
  },
  {
    // A tagged PDF whose parent tree (a number tree, with a page's entry indexed by marked-content id) and a name tree
    // of destinations both point at the note: removing the references must not shift the pairs (Info A).
    name: 'a note a number tree and a name tree point at',
    pdf: () =>
      pdfFromObjects([
        pdfObject(
          1,
          '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Names << /Dests << /Names [(bab-1) 4 0 R (sampul) [3 0 R /Fit]] >> >> >>',
        ),
        pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        pdfObject(
          3,
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Annots [4 0 R] /StructParents 0 >>',
        ),
        pdfObject(4, NOTE),
        pdfObject(
          5,
          '<< /Type /StructTreeRoot /K [6 0 R] /ParentTree << /Nums [0 [6 0 R 4 0 R 6 0 R] 1 4 0 R 2 6 0 R] >> /ParentTreeNextKey 3 >>',
        ),
        pdfObject(6, '<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K [0 1 2] >>'),
      ]),
    needles: ['Pak Budi', 'catatan rahasia'],
    comments: 1,
  },
];

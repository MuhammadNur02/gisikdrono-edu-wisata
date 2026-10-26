import 'server-only';

import path from 'node:path';

import { Font, StyleSheet } from '@react-pdf/renderer';

// The look every booking document shares (docs/StyleGuide.md §2, §8: deep slate header, royal accent rule, the two
// registered families). A PDF has no CSS variables, so these are the light-mode tokens of src/styles/globals.css in
// hex; change them together. Fonts are the TTF files of src/lib/pdf/fonts, carried into the serverless bundle by
// outputFileTracingIncludes (next.config.ts), and hyphenation is off so no name or number is ever broken in two.

export const PDF_COLORS = {
  deep: '#0f172a',
  royal: '#1e40af',
  ice: '#eff6ff',
  text: '#0f172a',
  muted: '#71717a',
  border: '#e2e8f0',
  paper: '#ffffff',
  success: '#16a34a',
} as const;

export const PDF_FONTS = { display: 'Plus Jakarta Sans', body: 'Inter' } as const;

const FONT_FILES = {
  display: [{ file: 'PlusJakartaSans-Bold.ttf', fontWeight: 700 }],
  body: [
    { file: 'Inter-Regular.ttf', fontWeight: 400 },
    { file: 'Inter-SemiBold.ttf', fontWeight: 600 },
  ],
} as const;

const fontsFolder = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');

let areFontsRegistered = false;

export function registerPdfFonts(): void {
  if (areFontsRegistered) return;
  for (const [role, files] of Object.entries(FONT_FILES)) {
    Font.register({
      family: PDF_FONTS[role as keyof typeof PDF_FONTS],
      fonts: files.map(({ file, fontWeight }) => ({
        src: path.join(fontsFolder, file),
        fontWeight,
      })),
    });
  }
  Font.registerHyphenationCallback((word) => [word]);
  areFontsRegistered = true;
}

const PAGE_MARGIN = 48;
// Room under the body for the fixed footer line.
const FOOTER_SPACE = 16;
const BODY_SIZE = 10;
const SMALL_SIZE = 8.5;
const TITLE_SIZE = 16;
const HEADING_SIZE = 12;

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN + FOOTER_SPACE,
    paddingHorizontal: PAGE_MARGIN,
    fontFamily: PDF_FONTS.body,
    fontSize: BODY_SIZE,
    lineHeight: 1.45,
    color: PDF_COLORS.text,
    backgroundColor: PDF_COLORS.paper,
  },
  letterhead: {
    borderBottomWidth: 2,
    borderBottomColor: PDF_COLORS.royal,
    paddingBottom: 10,
    marginBottom: 18,
  },
  letterheadName: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: HEADING_SIZE,
    color: PDF_COLORS.deep,
  },
  letterheadLine: { fontSize: SMALL_SIZE, color: PDF_COLORS.muted },
  title: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: TITLE_SIZE,
    color: PDF_COLORS.deep,
    marginBottom: 2,
  },
  overline: { fontSize: SMALL_SIZE, color: PDF_COLORS.royal, fontWeight: 600, letterSpacing: 0.6 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 14,
  },
  metaBlock: { width: '48%' },
  label: { fontSize: SMALL_SIZE, color: PDF_COLORS.muted },
  value: { fontWeight: 600 },
  paragraph: { marginBottom: 8 },
  // One labelled block of the access-request export (dsr-export.tsx).
  section: { marginTop: 12 },
  table: {
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    marginTop: 6,
    marginBottom: 10,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: PDF_COLORS.ice,
    fontWeight: 600,
    fontSize: SMALL_SIZE,
  },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: PDF_COLORS.border },
  cell: { paddingVertical: 5, paddingHorizontal: 8 },
  cellName: { flexGrow: 1, flexBasis: 0 },
  cellNumber: { width: 60, textAlign: 'right' },
  cellMoney: { width: 92, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 2,
    borderTopColor: PDF_COLORS.deep,
    paddingTop: 6,
    marginBottom: 14,
  },
  totalLabel: { fontWeight: 600, marginRight: 16 },
  totalValue: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: HEADING_SIZE,
    color: PDF_COLORS.deep,
  },
  notice: {
    backgroundColor: PDF_COLORS.ice,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.royal,
    padding: 8,
    marginTop: 4,
    marginBottom: 14,
    fontWeight: 600,
  },
  signature: { marginTop: 22, alignSelf: 'flex-end', width: 200 },
  signatureSpace: { height: 54 },
  signatureName: {
    fontWeight: 600,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: PAGE_MARGIN,
    right: PAGE_MARGIN,
    fontSize: SMALL_SIZE,
    color: PDF_COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 6,
  },
  stamp: {
    position: 'absolute',
    top: 150,
    right: PAGE_MARGIN,
    borderWidth: 3,
    borderColor: PDF_COLORS.success,
    color: PDF_COLORS.success,
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: 22,
    paddingVertical: 4,
    paddingHorizontal: 14,
    transform: 'rotate(-12deg)',
  },
});

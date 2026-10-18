import { fileTypeFromBuffer } from 'file-type';

import {
  ACCEPTED_IMAGE_TYPES,
  BOOKLET_PDF_TYPE,
  HEIF_TYPES,
  MAX_BOOKLET_PDF_BYTES,
  MAX_IMAGE_BYTES,
} from '@/config/uploads';
import { isHeifSignature } from '@/lib/uploads/heif';
import type { UploadKind, UploadProblem } from '@/types/upload';

// What a file really is, decided from its bytes with file-type (docs/Security.md §8.4: the declared type is
// untrusted). api/uploads/sign checks the type the browser declares and the file's first bytes so a wrong
// file is refused before it travels; api/uploads/finalize checks the whole file again, which is the control.

const IMAGE_TYPES: ReadonlySet<string> = new Set(ACCEPTED_IMAGE_TYPES);
const HEIF: ReadonlySet<string> = new Set(HEIF_TYPES);
const SVG_TYPE = 'image/svg+xml';
const XML_TYPE = 'application/xml';
const SVG_SNIFF_BYTES = 1024;

interface DetectedFile {
  type: string | null;
  isSvg: boolean;
  isHeif: boolean;
}

export type RequestCheck = { kind: UploadKind } | { problem: UploadProblem };

export type FileCheck =
  { kind: UploadKind; type: string } | { problem: UploadProblem; type: string | null };

export function kindOfType(type: string | null): UploadKind | null {
  if (type !== null && IMAGE_TYPES.has(type)) return 'image';
  return type === BOOKLET_PDF_TYPE ? 'pdf' : null;
}

// SVG is text, so file-type finds nothing (or plain XML); a look at the first kilobyte names it, because
// people expect SVG to work and deserve to hear why it does not (docs/StyleGuide.md §5.6).
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, SVG_SNIFF_BYTES)).toString('latin1').toLowerCase();
  return head.includes('<svg');
}

async function detectFile(bytes: Uint8Array): Promise<DetectedFile> {
  const type = (await fileTypeFromBuffer(bytes))?.mime ?? null;
  const isText = type === null || type === XML_TYPE;
  return {
    type,
    isSvg: isText && looksLikeSvg(bytes),
    isHeif: isHeifSignature(bytes) || (type !== null && HEIF.has(type)),
  };
}

function problemForFile(file: DetectedFile): UploadProblem | null {
  if (file.isSvg || file.type === SVG_TYPE) return 'svg';
  if (file.isHeif) return 'heic';
  return kindOfType(file.type) === null ? 'type' : null;
}

function sizeProblem(kind: UploadKind, size: number): UploadProblem | null {
  if (kind === 'pdf') return size > MAX_BOOKLET_PDF_BYTES ? 'pdf_size' : null;
  return size > MAX_IMAGE_BYTES ? 'image_size' : null;
}

function declaredFile(contentType: string): DetectedFile {
  return { type: contentType, isSvg: false, isHeif: HEIF.has(contentType) };
}

// api/uploads/sign: SVG and HEIC get their own message whichever side gives them away (the browser on
// Windows reports a HEIC as no type at all); otherwise the declared type and the first bytes must both be
// an accepted kind, the same kind, and within that kind's size limit.
export async function checkUploadRequest(request: {
  contentType: string;
  size: number;
  leadingBytes: Uint8Array;
}): Promise<RequestCheck> {
  const declared = declaredFile(request.contentType);
  const sniffed = await detectFile(request.leadingBytes);
  const problems = [problemForFile(sniffed), problemForFile(declared)];
  const specific = problems.find((problem) => problem === 'svg' || problem === 'heic');
  if (specific) return { problem: specific };

  const kind = kindOfType(declared.type);
  if (kind === null || kindOfType(sniffed.type) !== kind) return { problem: 'type' };
  const tooLarge = sizeProblem(kind, request.size);
  return tooLarge ? { problem: tooLarge } : { kind };
}

// api/uploads/finalize: the whole file, against the kind its purpose takes.
export async function checkUploadedFile(
  bytes: Uint8Array,
  expectedKind: UploadKind,
): Promise<FileCheck> {
  const file = await detectFile(bytes);
  const problem = problemForFile(file);
  if (problem) return { problem, type: file.type };

  const kind = kindOfType(file.type);
  if (kind !== expectedKind || file.type === null)
    return { problem: 'wrong_kind', type: file.type };
  const tooLarge = sizeProblem(kind, bytes.byteLength);
  return tooLarge ? { problem: tooLarge, type: file.type } : { kind, type: file.type };
}

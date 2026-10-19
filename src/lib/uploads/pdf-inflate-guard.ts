import { AsyncLocalStorage } from 'node:async_hooks';
import { constants, inflateSync } from 'node:zlib';

import {
  PDFArray,
  PDFName,
  PDFObjectStreamParser,
  PDFXRefStreamParser,
  type PDFObject,
  type PDFRawStream,
} from 'pdf-lib';

import { MAX_PDF_INFLATED_BYTES } from '@/config/uploads';

// pdf-lib inflates every object stream and cross-reference stream while it loads, with no limit, so a 300 KB file
// can unpack into gigabytes (security review of PR #14, L2). Both go through PDFObjectStreamParser.forStream and
// PDFXRefStreamParser.forStream, so those two are wrapped here: during a booklet scan, and only then, each such
// stream is first inflated by zlib under maxOutputLength, all of them together within MAX_PDF_INFLATED_BYTES. A
// stream packed with any filter but a single FlateDecode, or one zlib cannot read, is refused before pdf-lib decodes
// it. Wrapping pdf-lib's own entry points means the guard sees exactly the streams pdf-lib would inflate, however
// their dictionaries are spelled. The budget lives in an AsyncLocalStorage, so scans running side by side keep
// their own and any other use of pdf-lib is untouched.

export type PackedStreamRefusal = 'too_large' | 'unsupported_filter' | 'unreadable';

type ScanBudget = { remaining: number; refusal: PackedStreamRefusal | null };

const scanBudget = new AsyncLocalStorage<ScanBudget>();
const FLATE_NAMES = new Set(['FlateDecode', 'Fl']);

class PackedStreamError extends Error {
  constructor(readonly refusal: PackedStreamRefusal) {
    super(refusal);
    this.name = 'PackedStreamError';
  }
}

function refuse(budget: ScanBudget, refusal: PackedStreamRefusal): never {
  budget.refusal = refusal;
  throw new PackedStreamError(refusal);
}

function filtersOf(stream: PDFRawStream): (PDFObject | undefined)[] {
  const filter = stream.dict.lookup(PDFName.of('Filter'));
  if (filter === undefined) return [];
  if (!(filter instanceof PDFArray)) return [filter];
  return filter.asArray().map((entry) => stream.dict.context.lookup(entry));
}

function checkStream(stream: PDFRawStream): void {
  const budget = scanBudget.getStore();
  if (!budget) return;
  const filters = filtersOf(stream);
  if (filters.length === 0) return;
  const [filter] = filters;
  const isFlate = filter instanceof PDFName && FLATE_NAMES.has(filter.decodeText());
  if (filters.length > 1 || !isFlate) refuse(budget, 'unsupported_filter');
  if (budget.remaining <= 0) refuse(budget, 'too_large');
  try {
    const options = { maxOutputLength: budget.remaining, finishFlush: constants.Z_SYNC_FLUSH };
    budget.remaining -= inflateSync(stream.contents, options).length;
  } catch (error) {
    refuse(budget, error instanceof RangeError ? 'too_large' : 'unreadable');
  }
}

const decodeObjectStream = PDFObjectStreamParser.forStream;
const decodeXRefStream = PDFXRefStreamParser.forStream;

// Wrapped once per process; a second import (a dev server reload) finds the wrapper already in place.
if (decodeObjectStream.name !== 'guardedObjectStream') {
  PDFObjectStreamParser.forStream = function guardedObjectStream(rawStream, shouldWaitForTick) {
    checkStream(rawStream);
    return decodeObjectStream(rawStream, shouldWaitForTick);
  };
  PDFXRefStreamParser.forStream = function guardedXRefStream(rawStream) {
    checkStream(rawStream);
    return decodeXRefStream(rawStream);
  };
}

export type LimitedLoad<T> = { ok: true; value: T } | { ok: false; refusal: PackedStreamRefusal };

// Runs a booklet's load under the inflate budget. pdf-lib turns the guard's error into one of its own, so the
// refusal is read from the budget, not from what reaches here.
export async function withInflateLimit<T>(load: () => Promise<T>): Promise<LimitedLoad<T>> {
  const budget: ScanBudget = { remaining: MAX_PDF_INFLATED_BYTES, refusal: null };
  try {
    return { ok: true, value: await scanBudget.run(budget, load) };
  } catch (error) {
    if (budget.refusal) return { ok: false, refusal: budget.refusal };
    throw error;
  }
}

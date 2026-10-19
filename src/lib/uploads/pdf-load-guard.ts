import { AsyncLocalStorage } from 'node:async_hooks';
import { constants, inflateSync } from 'node:zlib';

import {
  PDFArray,
  PDFName,
  PDFObjectParser,
  PDFObjectStreamParser,
  PDFXRefStreamParser,
  type PDFObject,
  type PDFRawStream,
} from 'pdf-lib';

import { MAX_PDF_INFLATED_BYTES, MAX_PDF_PARSED_OBJECTS } from '@/config/uploads';

// What loading a booklet may cost (security review of PR #14, L2 and N3). pdf-lib has no limits of its own:
// - it inflates every object stream and cross-reference stream while it loads, so a 300 KB file can unpack into
//   gigabytes. Both go through PDFObjectStreamParser.forStream and PDFXRefStreamParser.forStream, so during a scan
//   each such stream is first inflated by zlib under maxOutputLength, all of them together within one budget for
//   the whole document; a stream packed with anything but a single FlateDecode, or one zlib cannot read, is
//   refused before pdf-lib decodes it;
// - every object it parses, down to each number in an array, becomes a JavaScript object, so a few kilobytes that
//   inflate to one huge array cost gigabytes of heap. PDFObjectParser.prototype.parseObject, which every parser
//   inherits, is counted, and the load stops past MAX_PDF_PARSED_OBJECTS or past the scan's deadline.
// Wrapping pdf-lib's own entry points means the guard sees exactly what pdf-lib would decode, however a dictionary
// is spelled. The budget lives in an AsyncLocalStorage, so scans running side by side keep their own and any other
// use of pdf-lib is untouched.

export type LoadRefusal =
  'too_large' | 'unsupported_filter' | 'unreadable' | 'too_many_objects' | 'too_slow';

type ScanBudget = {
  inflateRemaining: number;
  parsedObjects: number;
  deadlineMs: number;
  refusal: LoadRefusal | null;
};

const scanBudget = new AsyncLocalStorage<ScanBudget>();
const FLATE_NAMES = new Set(['FlateDecode', 'Fl']);
// Reading the clock on every object would cost more than the parse; every few thousand objects is soon enough.
const OBJECTS_PER_CLOCK_CHECK = 4096;

class LoadLimitError extends Error {
  constructor(readonly refusal: LoadRefusal) {
    super(refusal);
    this.name = 'LoadLimitError';
  }
}

function refuse(budget: ScanBudget, refusal: LoadRefusal): never {
  budget.refusal ??= refusal;
  throw new LoadLimitError(budget.refusal);
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
  if (budget.refusal) refuse(budget, budget.refusal);
  const filters = filtersOf(stream);
  if (filters.length === 0) return;
  const [filter] = filters;
  const isFlate = filter instanceof PDFName && FLATE_NAMES.has(filter.decodeText());
  if (filters.length > 1 || !isFlate) refuse(budget, 'unsupported_filter');
  if (budget.inflateRemaining <= 0) refuse(budget, 'too_large');
  try {
    const options = {
      maxOutputLength: budget.inflateRemaining,
      finishFlush: constants.Z_SYNC_FLUSH,
    };
    budget.inflateRemaining -= inflateSync(stream.contents, options).length;
  } catch (error) {
    refuse(budget, error instanceof RangeError ? 'too_large' : 'unreadable');
  }
}

function countParsedObject(): void {
  const budget = scanBudget.getStore();
  if (!budget) return;
  if (budget.refusal) refuse(budget, budget.refusal);
  budget.parsedObjects += 1;
  if (budget.parsedObjects > MAX_PDF_PARSED_OBJECTS) refuse(budget, 'too_many_objects');
  const isClockDue = budget.parsedObjects % OBJECTS_PER_CLOCK_CHECK === 0;
  if (isClockDue && performance.now() > budget.deadlineMs) refuse(budget, 'too_slow');
}

const decodeObjectStream = PDFObjectStreamParser.forStream;
const decodeXRefStream = PDFXRefStreamParser.forStream;
// pdf-lib's own parseObject, called back from the counting wrapper with the parser it belongs to.
type ParseObject = (this: PDFObjectParser) => PDFObject;
const parserPrototype: { parseObject: ParseObject } = PDFObjectParser.prototype;
const parseObject = parserPrototype.parseObject;

// Wrapped once per process; a second import (a dev server reload) finds the wrappers already in place.
if (decodeObjectStream.name !== 'guardedObjectStream') {
  PDFObjectStreamParser.forStream = function guardedObjectStream(rawStream, shouldWaitForTick) {
    checkStream(rawStream);
    return decodeObjectStream(rawStream, shouldWaitForTick);
  };
  PDFXRefStreamParser.forStream = function guardedXRefStream(rawStream) {
    checkStream(rawStream);
    return decodeXRefStream(rawStream);
  };
  PDFObjectParser.prototype.parseObject = function countedParseObject(this: PDFObjectParser) {
    countParsedObject();
    return parseObject.call(this);
  };
}

export type LimitedLoad<T> = { ok: true; value: T } | { ok: false; refusal: LoadRefusal };

// Runs a booklet's load under the scan's limits, until `deadlineMs` on performance.now()'s clock. pdf-lib turns the
// guard's error into one of its own, so the refusal is read from the budget, not from what reaches here.
export async function withLoadLimits<T>(
  load: () => Promise<T>,
  deadlineMs: number,
): Promise<LimitedLoad<T>> {
  const budget: ScanBudget = {
    inflateRemaining: MAX_PDF_INFLATED_BYTES,
    parsedObjects: 0,
    deadlineMs,
    refusal: null,
  };
  try {
    return { ok: true, value: await scanBudget.run(budget, load) };
  } catch (error) {
    if (budget.refusal) return { ok: false, refusal: budget.refusal };
    throw error;
  }
}

'use client';

import { FileText, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';

import { BOOKLET_PDF_TYPE } from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import { checkBookletFile, type BookletFileProblem } from '@/lib/uploads/booklet-file';
import { UploadRejectedError } from '@/lib/uploads/upload-error';
import { cn } from '@/lib/utils/cn';
import type { FinalizedPdf } from '@/types/upload';

// The upload is passed in, usually (file, onPage) => uploadBooklet(file, { rwId, bookletId }, onPage) from
// src/lib/uploads/upload-client.ts, which publishes the PDF and then each page; this component handles choosing,
// the quick check, the progress and the server's answer.
export type UploadBooklet = (
  file: File,
  onPage: (done: number, total: number) => void,
) => Promise<FinalizedPdf>;

export interface BookletUploaderProps {
  value: FinalizedPdf | null;
  onChange: (booklet: FinalizedPdf) => void;
  upload: UploadBooklet;
  id?: string;
}

type Progress = { done: number; total: number } | null;

const PROBLEM_COPY: Record<BookletFileProblem, string> = {
  type: copy.forms.booklet.type,
  size: copy.uploads.problems.pdf_size,
};

function useBookletUpload({ onChange, upload }: Pick<BookletUploaderProps, 'onChange' | 'upload'>) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    const problem = checkBookletFile(file);
    setError(problem ? PROBLEM_COPY[problem] : null);
    if (problem) return;
    setIsUploading(true);
    setProgress(null);
    try {
      onChange(
        await upload(file, (done, total) => {
          setProgress({ done, total });
        }),
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof UploadRejectedError
          ? uploadError.message
          : copy.forms.booklet.failed,
      );
    } finally {
      setIsUploading(false);
    }
  }

  return { choose, error, isUploading, progress };
}

function statusOf(isUploading: boolean, progress: Progress, value: FinalizedPdf | null): string {
  if (isUploading) {
    return progress
      ? copy.forms.booklet.pages(progress.done, progress.total)
      : copy.forms.booklet.uploading;
  }
  return value ? copy.forms.booklet.done(value.pageCount) : '';
}

interface PickerProps {
  inputId: string;
  hintId: string;
  isUploading: boolean;
  onFile: (file: File | undefined) => void;
}

function BookletPicker({ inputId, hintId, isUploading, onFile }: PickerProps) {
  const Icon = isUploading ? Loader2 : FileText;
  return (
    <label
      htmlFor={inputId}
      className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-muted/40 p-6 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
    >
      <Icon
        aria-hidden
        className={cn('size-6 text-muted-foreground', isUploading && 'motion-safe:animate-spin')}
      />
      <span className="text-body-sm font-medium">{copy.forms.booklet.choose}</span>
      <span className="text-caption text-muted-foreground">{copy.forms.booklet.hint}</span>
      <input
        id={inputId}
        type="file"
        accept={BOOKLET_PDF_TYPE}
        className="sr-only"
        disabled={isUploading}
        aria-describedby={hintId}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );
}

// docs/StyleGuide.md §5.6: a PDF of at most 50 MB and 100 pages, the GPS reminder of docs/Security.md §8.4 under
// it, page progress read out as it changes, and the server's own message when it refuses the file.
export function BookletUploader({ value, onChange, upload, id }: BookletUploaderProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const hintId = `${inputId}-gps`;
  const { choose, error, isUploading, progress } = useBookletUpload({ onChange, upload });

  return (
    <div className="flex flex-col gap-3">
      {!value && (
        <>
          <BookletPicker
            inputId={inputId}
            hintId={hintId}
            isUploading={isUploading}
            onFile={(file) => {
              void choose(file);
            }}
          />
          <p id={hintId} className="text-caption text-muted-foreground">
            {copy.forms.booklet.gpsHint}
          </p>
        </>
      )}
      <p aria-live="polite" className="text-body-sm empty:hidden">
        {statusOf(isUploading, progress, value)}
      </p>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

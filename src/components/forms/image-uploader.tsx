'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import { useId, useState } from 'react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, ALT_TEXT_MAX_LENGTH } from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import {
  checkImageFile,
  resizeImageForUpload,
  type ImageFileProblem,
} from '@/lib/images/client-resize';
import { cn } from '@/lib/utils/cn';
import type { UploadedImage } from '@/types/forms';

// The signed-URL upload and finalize step (api/uploads/sign, api/uploads/finalize, P2.9) are passed in,
// so this component only handles choosing, checking, shrinking and describing the photo.
export type UploadImage = (file: Blob) => Promise<Omit<UploadedImage, 'altText'>>;

export interface ImageUploaderProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  upload: UploadImage;
}

const PROBLEM_COPY: Record<ImageFileProblem, string> = {
  svg: copy.forms.image.svg,
  type: copy.forms.image.type,
  size: copy.forms.image.size,
};

function useImageUpload({
  value,
  onChange,
  upload,
}: Pick<ImageUploaderProps, 'value' | 'onChange' | 'upload'>) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    const problem = checkImageFile(file);
    setError(problem ? PROBLEM_COPY[problem] : null);
    if (problem) return;
    setIsUploading(true);
    try {
      const uploaded = await upload(await resizeImageForUpload(file));
      onChange({ ...uploaded, altText: value?.altText ?? '' });
    } catch {
      setError(copy.forms.image.failed);
    } finally {
      setIsUploading(false);
    }
  }

  return { choose, error, isUploading };
}

// Dragging a photo over the zone tints it, so people can see where to let go.
function useDropTarget(onFile: (file: File | undefined) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const handlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: () => {
      setIsDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      onFile(event.dataTransfer.files[0]);
    },
  };
  return { isDragging, handlers };
}

function DropZonePrompt({ isUploading }: { isUploading: boolean }) {
  const Icon = isUploading ? Loader2 : ImagePlus;
  return (
    <>
      <Icon
        aria-hidden
        className={cn('size-6 text-muted-foreground', isUploading && 'motion-safe:animate-spin')}
      />
      <span className="text-body-sm font-medium">
        {isUploading ? copy.forms.image.uploading : copy.forms.image.choose}
      </span>
      <span className="text-caption text-muted-foreground">{copy.forms.image.hint}</span>
    </>
  );
}

interface DropZoneProps {
  inputId: string;
  isUploading: boolean;
  onFile: (file: File | undefined) => void;
  inputProps: React.ComponentProps<'input'>;
}

function DropZone({ inputId, isUploading, onFile, inputProps }: DropZoneProps) {
  const { isDragging, handlers } = useDropTarget(onFile);
  return (
    <label
      htmlFor={inputId}
      {...handlers}
      className={cn(
        'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-muted/40 p-6 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
        isDragging && 'border-primary bg-secondary',
      )}
    >
      <DropZonePrompt isUploading={isUploading} />
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
        {...inputProps}
      />
    </label>
  );
}

function UploadedSummary({ image, onRemove }: { image: UploadedImage; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <span className="min-w-0 truncate text-body-sm">
        {image.path}{' '}
        <span className="text-muted-foreground tabular-nums">
          ({image.width}×{image.height})
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        className="size-11 shrink-0 p-0"
        aria-label={copy.forms.image.remove}
        onClick={onRemove}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

function AltTextField({
  id,
  image,
  onChange,
}: {
  id: string;
  image: UploadedImage;
  onChange: (image: UploadedImage) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{copy.forms.image.altLabel}</Label>
      <Input
        id={id}
        required
        maxLength={ALT_TEXT_MAX_LENGTH}
        aria-describedby={hintId}
        value={image.altText}
        onChange={(event) => {
          onChange({ ...image, altText: event.target.value });
        }}
      />
      <p id={hintId} className="text-caption text-muted-foreground">
        {copy.forms.image.altHint}
      </p>
    </div>
  );
}

// docs/StyleGuide.md §5.6: JPEG, PNG or WebP up to 10 MB, shrunk to 1600 px in the browser, SVG refused
// with its own message, and an alt text that galleries require (docs/StyleGuide.md §9.1 A8).
export function ImageUploader({ value, onChange, upload, id, ...inputProps }: ImageUploaderProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const { choose, error, isUploading } = useImageUpload({ value, onChange, upload });

  return (
    <div className="flex flex-col gap-3">
      {value ? (
        <UploadedSummary
          image={value}
          onRemove={() => {
            onChange(null);
          }}
        />
      ) : (
        <DropZone
          inputId={inputId}
          isUploading={isUploading}
          onFile={(file) => {
            void choose(file);
          }}
          inputProps={inputProps}
        />
      )}
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {value && <AltTextField id={`${inputId}-alt`} image={value} onChange={onChange} />}
    </div>
  );
}

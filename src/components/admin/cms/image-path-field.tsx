'use client';

import { useState } from 'react';

import { ImageUploader, type UploadImage } from '@/components/forms/image-uploader';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { copy } from '@/lib/copy/id';
import type { UploadedImage } from '@/types/forms';

export interface ImagePathFieldProps {
  // The public-media path the row keeps, or null.
  value: string | null;
  onChange: (path: string | null) => void;
  // createImageUpload({ rwId, purpose, entityId }) for the row's owner and folder.
  upload: UploadImage;
  // How the preview describes the photo; the row keeps no alt text of its own.
  alt: string;
  id?: string;
}

// A photo column that keeps only its path (a banner, an RW page, an activity point): the photo it shows now, or the
// uploader of docs/StyleGuide.md §5.6 to put one in.
export function ImagePathField({ value, onChange, upload, alt, id }: ImagePathFieldProps) {
  const [uploaded, setUploaded] = useState<UploadedImage | null>(null);
  if (value) {
    return (
      <div className="flex flex-col items-start gap-3">
        <PhotoFrame
          image={{ path: value, alt, width: null, height: null, placeholderColour: null }}
          sizes={IMAGE_SIZES.split}
          aspectClassName="aspect-video"
          className="w-full max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setUploaded(null);
            onChange(null);
          }}
        >
          {copy.cms.common.removePhoto}
        </Button>
      </div>
    );
  }
  return (
    <ImageUploader
      id={id}
      value={uploaded}
      upload={upload}
      withAltText={false}
      onChange={(image) => {
        setUploaded(image);
        onChange(image?.path ?? null);
      }}
    />
  );
}

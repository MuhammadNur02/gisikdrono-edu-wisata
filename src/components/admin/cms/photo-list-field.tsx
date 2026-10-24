'use client';

import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

import type { UploadImage } from '@/components/forms/image-uploader';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';

// The uploader (file checks, the browser resize, the signed upload) loads with the field, outside the first load of
// the package and product pages (admin budget, review of PR #35).
const ImageUploader = dynamic(() =>
  import('@/components/forms/image-uploader').then((module) => module.ImageUploader),
);

export interface PhotoListFieldProps {
  // The public-media paths the row keeps, the cover first.
  paths: readonly string[];
  onChange: (paths: string[]) => void;
  // createImageUpload({ rwId, purpose, entityId }) for the row's owner and folder.
  upload: UploadImage;
  // How the previews describe the photos; the row keeps no alt text per photo.
  alt: string;
  max: number;
  addLabel: string;
  removeLabel: (position: number) => string;
  maxReached: string;
}

function PhotoGrid({
  paths,
  alt,
  removeLabel,
  onRemove,
}: Pick<PhotoListFieldProps, 'paths' | 'alt' | 'removeLabel'> & {
  onRemove: (path: string) => void;
}) {
  if (paths.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {paths.map((path, index) => (
        <li key={path} className="relative">
          <PhotoFrame
            image={{ path, alt, width: null, height: null, placeholderColour: null }}
            sizes={IMAGE_SIZES.split}
            aspectClassName="aspect-video"
            className="w-full"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={removeLabel(index + 1)}
            className="absolute top-2 right-2 size-11"
            onClick={() => {
              onRemove(path);
            }}
          >
            <X aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

// A photo-array column (a package's or a product's photos, docs/Security.md R34): the photos it shows now and the
// uploader of docs/StyleGuide.md §5.6 for the next one, up to `max`. A photo taken off the list leaves the row's
// folder when the row is saved.
export function PhotoListField({ paths, onChange, upload, max, ...labels }: PhotoListFieldProps) {
  return (
    <div className="space-y-3">
      <PhotoGrid
        paths={paths}
        alt={labels.alt}
        removeLabel={labels.removeLabel}
        onRemove={(path) => {
          onChange(paths.filter((kept) => kept !== path));
        }}
      />
      {paths.length >= max ? (
        <p className="text-body-sm text-muted-foreground">{labels.maxReached}</p>
      ) : (
        <ImageUploader
          aria-label={labels.addLabel}
          value={null}
          upload={upload}
          withAltText={false}
          onChange={(image) => {
            if (image) onChange([...paths, image.path]);
          }}
        />
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import { TextField } from '@/components/admin/cms/fields';
import { FormField } from '@/components/forms/form-field';
import { ImageUploader } from '@/components/forms/image-uploader';
import { PhotoFrame } from '@/components/marketing/photo';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { IMAGE_SIZES } from '@/config/images';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import type { PublishedImage } from '@/lib/validations/content';
import type { CreateGalleryItemInput } from '@/lib/validations/gallery';
import type { ContentOwner } from '@/types/content';
import type { UploadedImage } from '@/types/forms';

const text = copy.cms.galleries;
const VIDEO_URL_MAX_LENGTH = 200;

type GalleryControl = Control<CreateGalleryItemInput>;

function toPublished(image: UploadedImage | null): PublishedImage | null {
  if (!image) return null;
  const { path, width, height, blurhash, thumbnailPath } = image;
  return { path, width, height, blurhash, thumbnailPath };
}

// One photo field of the form: the uploader keeps its own alt text out, since the item's alt text is a field of its
// own that covers a photo and a video alike.
function PhotoUpload({
  value,
  onChange,
  owner,
  id,
}: {
  value: PublishedImage | null;
  onChange: (image: PublishedImage | null) => void;
  owner: ContentOwner;
  id?: string;
}) {
  const upload = useMemo(() => createImageUpload({ rwId: owner, purpose: 'gallery' }), [owner]);
  const [uploaded, setUploaded] = useState<UploadedImage | null>(null);
  return (
    <ImageUploader
      id={id}
      value={value ? (uploaded ?? { ...value, altText: '' }) : null}
      upload={upload}
      withAltText={false}
      onChange={(image) => {
        setUploaded(image);
        onChange(toPublished(image));
      }}
    />
  );
}

export function MediaTypeField({ control }: { control: GalleryControl }) {
  return (
    <FormField
      control={control}
      name="mediaType"
      label={text.mediaType}
      render={(field) => (
        <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
          {DB_ENUMS.media_type.map((type) => (
            <div key={type} className="flex min-h-11 items-center gap-2">
              <RadioGroupItem value={type} id={`media-${type}`} />
              <Label htmlFor={`media-${type}`}>{text.mediaTypes[type]}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
    />
  );
}

// Task P2.9.08: the still a video will show in the gallery, as it will look there.
function StillPreview({ still }: { still: PublishedImage | null }) {
  if (!still) return null;
  return (
    <figure className="space-y-2">
      <PhotoFrame
        image={{
          path: still.path,
          alt: text.stillPreview,
          width: still.width,
          height: still.height,
          placeholderColour: null,
        }}
        sizes={IMAGE_SIZES.thumb}
        aspectClassName="aspect-video"
        className="w-full max-w-xs"
      />
      <figcaption className="text-caption text-muted-foreground">{text.stillPreview}</figcaption>
    </figure>
  );
}

export function VideoFields({ control, owner }: { control: GalleryControl; owner: ContentOwner }) {
  const still = useWatch({ control, name: 'still' });
  return (
    <>
      <TextField
        control={control}
        name="videoUrl"
        label={text.videoUrl}
        required
        type="url"
        maxLength={VIDEO_URL_MAX_LENGTH}
      />
      <FormField
        control={control}
        name="still"
        label={text.still}
        description={text.stillHint}
        render={(field) => (
          <PhotoUpload
            id={field.name}
            value={field.value}
            onChange={field.onChange}
            owner={owner}
          />
        )}
      />
      <StillPreview still={still} />
    </>
  );
}

export function PhotoFields({ control, owner }: { control: GalleryControl; owner: ContentOwner }) {
  return (
    <FormField
      control={control}
      name="image"
      label={copy.cms.common.photo}
      required
      render={(field) => (
        <PhotoUpload id={field.name} value={field.value} onChange={field.onChange} owner={owner} />
      )}
    />
  );
}

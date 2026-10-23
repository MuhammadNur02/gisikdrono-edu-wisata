'use client';

import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useController } from 'react-hook-form';

import { Section, type PackageControl } from '@/components/admin/packages/package-fields';
import { ImageUploader } from '@/components/forms/image-uploader';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { IMAGE_SIZES } from '@/config/images';
import { PACKAGE_LIMITS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';

const text = copy.packages.photos;

export interface PhotosSectionProps {
  control: PackageControl;
  // The package's owner (null for a combo, the kelurahan's) and id name its folder in public-media.
  owner: RwId | null;
  packageId: string;
  // Alt text for the previews; the package keeps no alt text per photo, the page describes them by its name.
  packageName: string;
}

function PhotoGrid({
  paths,
  alt,
  onRemove,
}: {
  paths: readonly string[];
  alt: string;
  onRemove: (path: string) => void;
}) {
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
            aria-label={text.remove(index + 1)}
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

// tour_packages.image_paths (docs/Security.md R34): the first photo is the cover. A photo taken off the list leaves
// the package's folder when the package is saved.
export function PhotosSection({ control, owner, packageId, packageName }: PhotosSectionProps) {
  const { field } = useController({ control, name: 'imagePaths' });
  const paths = field.value;
  const upload = useMemo(
    () => createImageUpload({ rwId: owner, purpose: 'package', entityId: packageId }),
    [owner, packageId],
  );
  return (
    <Section title={copy.packages.sections.photos}>
      <p className="text-body-sm text-muted-foreground">{text.hint}</p>
      <PhotoGrid
        paths={paths}
        alt={packageName}
        onRemove={(path) => {
          field.onChange(paths.filter((kept) => kept !== path));
        }}
      />
      {paths.length >= PACKAGE_LIMITS.images ? (
        <p className="text-body-sm text-muted-foreground">{text.max(PACKAGE_LIMITS.images)}</p>
      ) : (
        <ImageUploader
          aria-label={text.add}
          value={null}
          upload={upload}
          withAltText={false}
          onChange={(image) => {
            if (image) field.onChange([...paths, image.path]);
          }}
        />
      )}
    </Section>
  );
}

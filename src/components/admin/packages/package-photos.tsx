'use client';

import { useMemo } from 'react';
import { useController } from 'react-hook-form';

import { FormSection } from '@/components/admin/cms/form-section';
import { PhotoListField } from '@/components/admin/cms/photo-list-field';
import { type PackageControl } from '@/components/admin/packages/package-fields';
import { PACKAGE_LIMITS } from '@/config/packages';
import type { RwId } from '@/config/rw';
import { packagesCopy } from '@/lib/copy/packages';
import { createImageUpload } from '@/lib/uploads/upload-client';

const text = packagesCopy.photos;

export interface PhotosSectionProps {
  control: PackageControl;
  // The package's owner (null for a combo, the kelurahan's) and id name its folder in public-media.
  owner: RwId | null;
  packageId: string;
  // Alt text for the previews; the package keeps no alt text per photo, the page describes them by its name.
  packageName: string;
}

// tour_packages.image_paths (docs/Security.md R34): the first photo is the cover.
export function PhotosSection({ control, owner, packageId, packageName }: PhotosSectionProps) {
  const { field } = useController({ control, name: 'imagePaths' });
  const upload = useMemo(
    () => createImageUpload({ rwId: owner, purpose: 'package', entityId: packageId }),
    [owner, packageId],
  );
  return (
    <FormSection title={packagesCopy.sections.photos}>
      <p className="text-body-sm text-muted-foreground">{text.hint}</p>
      <PhotoListField
        paths={field.value}
        onChange={field.onChange}
        upload={upload}
        alt={packageName}
        max={PACKAGE_LIMITS.images}
        addLabel={text.add}
        removeLabel={text.remove}
        maxReached={text.max(PACKAGE_LIMITS.images)}
      />
    </FormSection>
  );
}

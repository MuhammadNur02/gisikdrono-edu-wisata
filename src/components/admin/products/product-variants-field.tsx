'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';

import { CheckboxField, OptionalSelectField, TextField } from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import type { ProductControl } from '@/components/admin/products/product-fields';
import { variantPath } from '@/components/admin/products/product-values';
import { PhotoFrame } from '@/components/marketing/photo';
import { Button } from '@/components/ui/button';
import { PRODUCT_LIMITS } from '@/config/products';
import { productsCopy } from '@/lib/copy/products';

const text = productsCopy.variants;
// The preview beside a variant's photo choice.
const THUMB_SIZES = '64px';

// A 44 px icon button whose name says which variant it acts on (docs/StyleGuide.md §9.1 A4).
function RowButton({
  label,
  isDisabled = false,
  onClick,
  children,
}: {
  label: string;
  isDisabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface RowActionsProps {
  name: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function RowActions({ name, index, count, onMove, onRemove }: RowActionsProps) {
  return (
    <div className="flex gap-1">
      <RowButton
        label={text.moveUp(name)}
        isDisabled={index === 0}
        onClick={() => {
          onMove(index, index - 1);
        }}
      >
        <ArrowUp aria-hidden />
      </RowButton>
      <RowButton
        label={text.moveDown(name)}
        isDisabled={index === count - 1}
        onClick={() => {
          onMove(index, index + 1);
        }}
      >
        <ArrowDown aria-hidden />
      </RowButton>
      <RowButton
        label={text.remove(name)}
        onClick={() => {
          onRemove(index);
        }}
      >
        <Trash2 aria-hidden />
      </RowButton>
    </div>
  );
}

// The variant's photo, one of the product's own, with a preview of the one chosen.
function PhotoChoice({ control, index }: { control: ProductControl; index: number }) {
  const photos = useWatch({ control, name: 'imagePaths' });
  const chosen = useWatch({ control, name: variantPath(index, 'imagePath') });
  if (photos.length === 0) {
    return <p className="text-caption text-muted-foreground">{text.photosAfterSave}</p>;
  }
  const options = photos.map((path, position) => ({
    value: path,
    label: text.photoOption(position + 1),
  }));
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <OptionalSelectField
          control={control}
          name={variantPath(index, 'imagePath')}
          label={text.photo(index + 1)}
          description={text.photoHint}
          options={options}
          noneLabel={text.noPhoto}
        />
      </div>
      {chosen ? (
        <PhotoFrame
          image={{ path: chosen, alt: '', width: null, height: null, placeholderColour: null }}
          sizes={THUMB_SIZES}
          aspectClassName="aspect-square"
          className="mb-1 size-16 shrink-0"
        />
      ) : null}
    </div>
  );
}

function VariantRow({
  control,
  index,
  actions,
}: {
  control: ProductControl;
  index: number;
  actions: Omit<RowActionsProps, 'name' | 'index'>;
}) {
  const label = useWatch({ control, name: variantPath(index, 'label') });
  const name = label.trim() || text.untitled(index + 1);
  return (
    <li className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextField
            control={control}
            name={variantPath(index, 'label')}
            label={text.label(index + 1)}
            maxLength={PRODUCT_LIMITS.variantLabel}
            required
          />
        </div>
        <RowActions name={name} index={index} {...actions} />
      </div>
      <PhotoChoice control={control} index={index} />
      <CheckboxField
        control={control}
        name={variantPath(index, 'isAvailable')}
        label={text.isAvailable}
      />
    </li>
  );
}

// product_variants (decision of 2026-10-30): the motifs or colours of the product, in the order the product page lists
// them. A variant's photo is picked from the product's own photos, which the Photos section above uploads through the
// product's pipeline, so no file goes anywhere else.
export function ProductVariants({ control }: { control: ProductControl }) {
  const { fields, append, move, remove } = useFieldArray({ control, name: 'variants' });
  const actions = { count: fields.length, onMove: move, onRemove: remove };
  return (
    <FormSection title={productsCopy.sections.variants}>
      <p className="text-body-sm text-muted-foreground">{text.hint}</p>
      {fields.length === 0 ? <p className="text-body-sm">{text.empty}</p> : null}
      <ol className="space-y-4">
        {fields.map((field, index) => (
          <VariantRow key={field.id} control={control} index={index} actions={actions} />
        ))}
      </ol>
      {fields.length >= PRODUCT_LIMITS.variants ? (
        <p className="text-body-sm text-muted-foreground">{text.max(PRODUCT_LIMITS.variants)}</p>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            append({ label: '', imagePath: null, isAvailable: true });
          }}
        >
          <Plus aria-hidden />
          {text.add}
        </Button>
      )}
    </FormSection>
  );
}

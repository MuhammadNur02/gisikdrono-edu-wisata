'use client';

import { Check } from 'lucide-react';
import { useId } from 'react';

import { chipClassName } from '@/components/marketing/filter-chip-class';
import { PhotoFrame } from '@/components/marketing/photo';
import { OrderChatLink } from '@/components/products/order-chat-link';
import { useVariantChoice } from '@/hooks/use-variant-choice';
import { productDetailCopy as text } from '@/lib/copy/catalogue';
import { cn } from '@/lib/utils/cn';
import { buildWhatsAppChatUrl, productOrderMessage } from '@/lib/utils/whatsapp';
import type { ProductVariant } from '@/types/product';

// The 32 px photo inside a variant chip.
const THUMB_SIZES = '32px';

// What a chip shows: the check once chosen, the variant's photo, its name, and `Habis` when it is not on sale.
function ChipContent({ variant, isChosen }: { variant: ProductVariant; isChosen: boolean }) {
  const isOff = !variant.isAvailable;
  return (
    <>
      {isChosen ? <Check aria-hidden className="size-4" /> : null}
      {variant.image ? (
        <PhotoFrame
          // The chip's own label names the variant, so its photo is decorative here.
          image={{ ...variant.image, alt: '' }}
          sizes={THUMB_SIZES}
          aspectClassName="aspect-square"
          className={cn('size-8 shrink-0 rounded-full', isOff && 'opacity-60')}
        />
      ) : null}
      <span className={cn(isOff && 'line-through')}>{variant.label}</span>
      {isOff ? <span className="text-caption">{text.variantUnavailable}</span> : null}
    </>
  );
}

function VariantOption({
  variant,
  name,
  isChosen,
  onChoose,
}: {
  variant: ProductVariant;
  name: string;
  isChosen: boolean;
  onChoose: () => void;
}) {
  const isOff = !variant.isAvailable;
  // A native radio inside the chip: arrow keys, one choice and a disabled state come from the browser; the chip shows
  // the focus ring of the radio it holds (docs/StyleGuide.md §5.4, §9.1 A2, A4: 44 px on phones).
  return (
    <label
      className={cn(
        chipClassName(isChosen),
        'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
        variant.image ? 'pl-1.5' : undefined,
        isOff &&
          'cursor-not-allowed border-border bg-muted text-muted-foreground hover:border-border hover:bg-muted',
      )}
    >
      <input
        type="radio"
        name={name}
        value={variant.id}
        checked={isChosen}
        disabled={isOff}
        onChange={onChoose}
        className="sr-only"
      />
      <ChipContent variant={variant} isChosen={isChosen} />
    </label>
  );
}

// docs/PRD.md FR-PUB-13a (decision of 2026-10-30): the variants of a product as one radio group. An unavailable one is
// shown, marked `Habis` and not selectable.
export function VariantPicker() {
  const { variants, chosen, choose } = useVariantChoice();
  const name = useId();
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-body-sm font-semibold">{text.variantsLegend}</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => (
          <VariantOption
            key={variant.id}
            variant={variant}
            name={name}
            isChosen={chosen?.id === variant.id}
            onChoose={() => {
              choose(variant.id);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export interface VariantOrderButtonProps {
  // The Koperasi Merah Putih's number as wa.me digits.
  whatsappDigits: string;
  productName: string;
  rwLabel: string;
}

// The order link of a product with variants: the message names the chosen variant, or asks for one while none is
// picked, and the line above the button says so.
export function VariantOrderButton({
  whatsappDigits,
  productName,
  rwLabel,
}: VariantOrderButtonProps) {
  const { chosen } = useVariantChoice();
  const hintId = useId();
  const message = productOrderMessage({
    productName,
    rwLabel,
    hasVariants: true,
    chosenVariant: chosen?.label ?? null,
  });
  return (
    <div className="flex flex-col gap-3">
      <p id={hintId} aria-live="polite" className="text-body-sm text-muted-foreground">
        {chosen ? text.variantChosen(chosen.label) : text.variantChooseHint}
      </p>
      <OrderChatLink
        href={buildWhatsAppChatUrl(whatsappDigits, message)}
        productName={productName}
        describedBy={hintId}
      />
    </div>
  );
}

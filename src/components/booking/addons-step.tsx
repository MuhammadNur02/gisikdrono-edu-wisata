'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus, Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import { QuotePreviewPanel } from '@/components/booking/quote-preview-panel';
import {
  WizardPanel,
  WizardStepFrame,
  type WizardStepProps,
} from '@/components/booking/wizard-step-frame';
import { NumberStepper } from '@/components/forms/number-stepper';
import { PostForm } from '@/components/forms/post-form';
import { PhotoFrame } from '@/components/marketing/photo';
import { PhotoPlaceholder } from '@/components/marketing/photo-placeholder';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { BOOKING_LIMITS } from '@/config/booking';
import { IMAGE_SIZES } from '@/config/images';
import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { addonsStepSchema } from '@/lib/validations/booking';
import type { AddonProduct } from '@/types/product';

const text = copy.booking.wizard.addons;

export interface AddonsStepProps extends WizardStepProps {
  addons: AddonProduct[];
  preview: QuotePreviewState;
}

interface AddonsValues {
  addons: { productId: string; qty: number }[];
}

type AddonsForm = UseFormReturn<AddonsValues>;

function useAddonsForm({ draft, update }: AddonsStepProps): AddonsForm {
  const form = useForm<AddonsValues>({
    resolver: zodResolver(addonsStepSchema),
    defaultValues: { addons: draft.addons },
  });
  // The draft keeps the list, so the shell's quote follows each change.
  useEffect(() => {
    const watcher = form.watch((values) => {
      update({
        addons: (values.addons ?? []).flatMap((line) =>
          line.productId ? [{ productId: line.productId, qty: line.qty ?? 0 }] : [],
        ),
      });
    });
    return () => {
      watcher.unsubscribe();
    };
  }, [form, update]);
  return form;
}

// DESIGN-SPEC §3.10 step 3: a 72 px tile (the product's photo, or its RW's tint with an icon), then the name, the
// vendor and the price per unit.
function ProductTile({ product }: { product: AddonProduct }) {
  if (product.cover) {
    return (
      <PhotoFrame
        image={product.cover}
        sizes={IMAGE_SIZES.listThumb}
        aspectClassName="aspect-square"
        className="size-16 shrink-0 rounded-lg md:size-18"
      />
    );
  }
  return (
    <PhotoPlaceholder
      label={product.name}
      icon={PackagePlus}
      rws={[product.rw]}
      iconClassName="size-7"
      className="size-16 shrink-0 rounded-lg md:size-18"
    />
  );
}

function ProductInfo({ product }: { product: AddonProduct }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <ProductTile product={product} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-h4 font-bold">{product.name}</p>
        <p className="text-body-sm text-muted-foreground">{product.vendorName}</p>
        <p className="text-body-sm tabular-nums">
          <span className="font-semibold text-foreground">{formatIDR(product.price)}</span>
          <span className="text-muted-foreground"> / {product.unitLabel}</span>
        </p>
        {product.leadTimeDays > 0 && (
          <p className="text-caption text-muted-foreground">
            {text.leadTime(product.leadTimeDays)}
          </p>
        )}
      </div>
    </div>
  );
}

type AddonLines = AddonsValues['addons'];

function RemoveButton(props: { form: AddonsForm; lines: AddonLines; product: AddonProduct }) {
  const { form, lines, product } = props;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={text.remove(product.name)}
      onClick={() => {
        const rest = lines.filter((line) => line.productId !== product.id);
        form.setValue('addons', rest, { shouldDirty: true });
      }}
    >
      <X aria-hidden />
    </Button>
  );
}

function QuantityControls({
  form,
  product,
  lineTotal,
}: {
  form: AddonsForm;
  product: AddonProduct;
  lineTotal: number | undefined;
}) {
  const lines = useWatch({ control: form.control, name: 'addons' });
  const line = lines.find((each) => each.productId === product.id);
  if (!line) return null;
  const setQuantity = (qty: number) => {
    const next = lines.map((each) => (each.productId === product.id ? { ...each, qty } : each));
    form.setValue('addons', next, { shouldDirty: true });
  };
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <NumberStepper
          aria-label={text.quantityLabel(product.name)}
          value={line.qty}
          min={product.minOrderQty}
          max={product.maxOrderQty ?? BOOKING_LIMITS.addonQuantity}
          onChange={setQuantity}
        />
        <RemoveButton form={form} lines={lines} product={product} />
      </div>
      {lineTotal !== undefined && (
        <p className="pr-12 text-label tabular-nums">{formatIDR(lineTotal)}</p>
      )}
      <p className="text-caption text-muted-foreground">
        {text.quantityRange(product.minOrderQty, product.maxOrderQty)}
      </p>
    </div>
  );
}

function AddonCard({
  form,
  product,
  lineTotal,
}: {
  form: AddonsForm;
  product: AddonProduct;
  lineTotal: number | undefined;
}) {
  const lines = useWatch({ control: form.control, name: 'addons' });
  const index = lines.findIndex((line) => line.productId === product.id);
  return (
    <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <ProductInfo product={product} />
      {index === -1 ? (
        <Button
          type="button"
          variant="outline"
          className="self-end sm:self-auto"
          onClick={() => {
            form.setValue(
              'addons',
              [...lines, { productId: product.id, qty: product.minOrderQty }],
              {
                shouldDirty: true,
              },
            );
          }}
        >
          <Plus aria-hidden /> {text.add}
        </Button>
      ) : (
        <QuantityControls form={form} product={product} lineTotal={lineTotal} />
      )}
    </li>
  );
}

// Each add-on's line total as the server priced it, shown beside its stepper; nothing here adds a rupiah.
function addonLineTotals(preview: QuotePreviewState): Map<string, number> {
  if (preview.status !== 'ready' || preview.answer.kind !== 'quote') return new Map();
  return new Map(
    preview.answer.quote.lines.flatMap((line) =>
      line.kind === 'addon' ? [[line.productId, line.lineTotal] as const] : [],
    ),
  );
}

// Step tambahan (docs/PRD.md FR-BOOK-04, Task P3.5.03): the add-ons of the RWs the package visits, each within the
// quantities its vendor takes, and the running total the server prices as the list changes.
export function AddonsStep(props: AddonsStepProps) {
  const { addons, preview, wizardPackage, onDone, onBack } = props;
  const form = useAddonsForm(props);
  const submit = form.handleSubmit(() => {
    onDone();
  });
  const addonTotals = addonLineTotals(preview);
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <WizardStepFrame
          title={text.title}
          description={text.description}
          onBack={onBack}
          backLabel={props.backLabel}
          nextLabel={props.nextLabel}
        >
          <WizardPanel>
            {addons.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">{text.empty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {addons.map((product) => (
                  <AddonCard
                    key={product.id}
                    form={form}
                    product={product}
                    lineTotal={addonTotals.get(product.id)}
                  />
                ))}
              </ul>
            )}
          </WizardPanel>
          <QuotePreviewPanel state={preview} wizardPackage={wizardPackage} />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}

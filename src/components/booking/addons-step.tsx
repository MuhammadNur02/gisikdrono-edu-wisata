'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';

import { QuotePreviewPanel } from '@/components/booking/quote-preview-panel';
import { WizardStepFrame, type WizardStepProps } from '@/components/booking/wizard-step-frame';
import { NumberStepper } from '@/components/forms/number-stepper';
import { PostForm } from '@/components/forms/post-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { BOOKING_LIMITS } from '@/config/booking';
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

function ProductInfo({ product }: { product: AddonProduct }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-body-sm font-medium">{product.name}</p>
      <p className="text-caption text-muted-foreground">{text.vendor(product.vendorName)}</p>
      <p className="text-caption tabular-nums">
        {text.price(formatIDR(product.price), product.unitLabel)}
      </p>
      {product.leadTimeDays > 0 && (
        <p className="text-caption text-muted-foreground">{text.leadTime(product.leadTimeDays)}</p>
      )}
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

function QuantityControls({ form, product }: { form: AddonsForm; product: AddonProduct }) {
  const lines = useWatch({ control: form.control, name: 'addons' });
  const line = lines.find((each) => each.productId === product.id);
  if (!line) return null;
  const setQuantity = (qty: number) => {
    const next = lines.map((each) => (each.productId === product.id ? { ...each, qty } : each));
    form.setValue('addons', next, { shouldDirty: true });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NumberStepper
        aria-label={text.quantityLabel(product.name)}
        value={line.qty}
        min={product.minOrderQty}
        max={product.maxOrderQty ?? BOOKING_LIMITS.addonQuantity}
        onChange={setQuantity}
      />
      <RemoveButton form={form} lines={lines} product={product} />
      <p className="w-full text-caption text-muted-foreground">
        {text.quantityRange(product.minOrderQty, product.maxOrderQty)}
      </p>
    </div>
  );
}

function AddonCard({ form, product }: { form: AddonsForm; product: AddonProduct }) {
  const lines = useWatch({ control: form.control, name: 'addons' });
  const index = lines.findIndex((line) => line.productId === product.id);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <ProductInfo product={product} />
      {index === -1 ? (
        <Button
          type="button"
          variant="outline"
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
        <QuantityControls form={form} product={product} />
      )}
    </li>
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
  return (
    <Form {...form}>
      <PostForm onSubmit={submit}>
        <WizardStepFrame title={text.title} description={text.description} onBack={onBack}>
          {addons.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">{text.empty}</p>
          ) : (
            <ul className="space-y-3">
              {addons.map((product) => (
                <AddonCard key={product.id} form={form} product={product} />
              ))}
            </ul>
          )}
          <QuotePreviewPanel state={preview} wizardPackage={wizardPackage} />
        </WizardStepFrame>
      </PostForm>
    </Form>
  );
}

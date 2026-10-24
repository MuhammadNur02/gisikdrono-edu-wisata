import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { securityCopy } from '@/lib/copy/security';

// The filters of /dashboard/security-alerts and /dashboard/audit-logs (Task P4.10.02): a plain GET form, so it works
// before any script loads and costs the page no client JavaScript. Every value it sends is parsed again on the server.

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterField =
  | {
      kind: 'select';
      name: string;
      label: string;
      value: string | undefined;
      options: readonly FilterOption[];
    }
  | { kind: 'date'; name: string; label: string; value: string | undefined }
  | { kind: 'hidden'; name: string; value: string | undefined };

const CONTROL_CLASS =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-body-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function FieldControl({ field }: { field: Exclude<FilterField, { kind: 'hidden' }> }) {
  const id = `filter-${field.name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-body-sm font-medium">
        {field.label}
      </label>
      {field.kind === 'select' ? (
        <select
          id={id}
          name={field.name}
          defaultValue={field.value ?? ''}
          className={CONTROL_CLASS}
        >
          <option value="">{securityCopy.all}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="date"
          name={field.name}
          defaultValue={field.value ?? ''}
          className={CONTROL_CLASS}
        />
      )}
    </div>
  );
}

export function FilterBar({
  fields,
  resetHref,
}: {
  fields: readonly FilterField[];
  resetHref: string;
}) {
  return (
    <form
      method="get"
      className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {fields.map((field) =>
        field.kind === 'hidden' ? (
          field.value ? (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ) : null
        ) : (
          <FieldControl key={field.name} field={field} />
        ),
      )}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit">{securityCopy.filter}</Button>
        <Button asChild variant="ghost">
          <Link href={resetHref}>{securityCopy.reset}</Link>
        </Button>
      </div>
    </form>
  );
}

// One titled group of a long form (a package, a product): a fieldset whose legend names it, so a screen reader hears
// which part a field belongs to.
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border p-4 sm:p-6">
      <legend className="px-1 text-h4">{title}</legend>
      {children}
    </fieldset>
  );
}

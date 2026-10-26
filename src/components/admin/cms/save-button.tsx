'use client';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';

// The catalogue forms' one save button (packages, products, vendors). Kept on its own so a form that needs only the
// button does not pull in the package form with it (admin first-load budget).
export function SaveButton({ isSubmitting }: { isSubmitting: boolean }) {
  return (
    <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
      {copy.cms.common.save}
    </Button>
  );
}

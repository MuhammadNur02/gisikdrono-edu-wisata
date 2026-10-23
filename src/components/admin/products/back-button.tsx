'use client';

import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

// The way back from a form to the list inside the same sheet.
export function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="max-md:min-h-11" onClick={onBack}>
      <ArrowLeft aria-hidden />
      {label}
    </Button>
  );
}

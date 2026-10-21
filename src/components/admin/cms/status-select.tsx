'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PUBLISHABLE_STATUSES, type PublishableStatus } from '@/config/cms';
import { copy } from '@/lib/copy/id';

export interface StatusSelectProps {
  value: PublishableStatus;
  onChange: (status: PublishableStatus) => void;
}

function isPublishableStatus(value: string): value is PublishableStatus {
  return PUBLISHABLE_STATUSES.some((status) => status === value);
}

// Draft or on the site, for content that needs no review (everything but articles).
export function StatusSelect({ value, onChange }: StatusSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isPublishableStatus(next)) onChange(next);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PUBLISHABLE_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {copy.cms.common.statusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

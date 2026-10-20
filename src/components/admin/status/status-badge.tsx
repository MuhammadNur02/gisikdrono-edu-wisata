import { Badge } from '@/components/ui/badge';
import { CONTENT_STATUS } from '@/config/status';
import type { EnumValue } from '@/db/enums';

export interface ContentStatusBadgeProps {
  status: EnumValue<'content_status'>;
}

// docs/StyleGuide.md §6.5: a status is never coloured by hand; its tone, label and icon come from src/config/status.ts.
export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  const { tone, outline, label, icon: Icon } = CONTENT_STATUS[status];
  return (
    <Badge variant={tone} appearance={outline ? 'outline' : 'solid'}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

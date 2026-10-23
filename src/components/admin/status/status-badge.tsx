import { Badge } from '@/components/ui/badge';
import { CONTENT_STATUS, type StatusMeta } from '@/config/status';
import type { EnumValue } from '@/db/enums';

export interface ContentStatusBadgeProps {
  status: EnumValue<'content_status'>;
}

// docs/StyleGuide.md §6.5: a status is never coloured by hand; its tone, label and icon come from src/config/status.ts.
export function StatusMetaBadge({ meta }: { meta: StatusMeta }) {
  const { tone, outline, label, icon: Icon } = meta;
  return (
    <Badge variant={tone} appearance={outline ? 'outline' : 'solid'}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  return <StatusMetaBadge meta={CONTENT_STATUS[status]} />;
}

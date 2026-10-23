import { Badge } from '@/components/ui/badge';
import { statusMetaOf, type StatusKind } from '@/config/status';
import type { EnumValue } from '@/db/enums';

export interface StatusBadgeProps<Kind extends StatusKind> {
  kind: Kind;
  value: EnumValue<Kind>;
  className?: string;
}

// docs/StyleGuide.md §6.5: a status is never coloured by hand; its tone, label and icon come from src/config/status.ts,
// looked up by the enum's own name. A value the map does not know shows as a neutral badge, never a crash
// (review of PR #31, item 9).
export function StatusBadge<Kind extends StatusKind>({
  kind,
  value,
  className,
}: StatusBadgeProps<Kind>) {
  const { tone, outline, label, icon: Icon } = statusMetaOf(kind, value);
  return (
    <Badge variant={tone} appearance={outline ? 'outline' : 'solid'} className={className}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export interface ContentStatusBadgeProps {
  status: EnumValue<'content_status'>;
}

// The content screens of Phase 2 read the content_status badge by this name.
export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  return <StatusBadge kind="content_status" value={status} />;
}

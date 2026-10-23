import { Badge } from '@/components/ui/badge';
import { STATUS_META, type StatusKind, type StatusMeta } from '@/config/status';
import type { EnumValue } from '@/db/enums';

export interface StatusBadgeProps<Kind extends StatusKind> {
  kind: Kind;
  value: EnumValue<Kind>;
  className?: string;
}

// Every map is a Record over its enum, so the value is always there; the index type only lets TypeScript see
// through the generic kind.
function statusMetaOf<Kind extends StatusKind>(kind: Kind, value: EnumValue<Kind>): StatusMeta {
  const map: Record<string, StatusMeta> = STATUS_META[kind];
  const meta = map[value];
  if (!meta) throw new Error(`No status meta for ${kind}.${value}`);
  return meta;
}

// docs/StyleGuide.md §6.5: a status is never coloured by hand; its tone, label and icon come from src/config/status.ts,
// looked up by the enum's own name. A value the map does not know fails the build.
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

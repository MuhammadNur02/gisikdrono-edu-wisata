import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { contentOwnerLabel } from '@/lib/utils/content-owner';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.owner;

export interface OwnerNoticeProps {
  owner: ContentOwner;
  isSuperadmin: boolean;
  // The table has no kelurahan rows (activity points), so `Semua` cannot be the owner.
  rwOnly?: boolean;
}

// The superadmin's RwSwitcher decides who what they create belongs to, so the form says it. An RW admin's content is
// always their own RW's and needs no notice (the form never asks for an RW).
export function OwnerNotice({ owner, isSuperadmin, rwOnly = false }: OwnerNoticeProps) {
  if (!isSuperadmin) return null;
  if (owner === null && rwOnly) return <FormAlert tone="info">{text.chooseRwFirst}</FormAlert>;
  const saved = text.savedFor(contentOwnerLabel(owner));
  return (
    <FormAlert tone="info">{owner === null ? `${saved} ${text.kelurahanHint}` : saved}</FormAlert>
  );
}

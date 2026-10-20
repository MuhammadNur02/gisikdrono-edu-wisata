import { SignOutButton } from '@/components/auth/sign-out-button';

const INITIALS_LENGTH = 2;

function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  return words
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

export interface UserCardProps {
  fullName: string;
  roleLabel: string;
}

// The sidebar footer (docs/StyleGuide.md §6.1): who is signed in, in which role, and `Keluar`. Initials stand in for
// the avatar until profiles can upload one (Task P4.8.03).
export function UserCard({ fullName, roleLabel }: UserCardProps) {
  return (
    <>
      <div className="flex items-center gap-3 px-2 py-1">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-body-sm font-semibold text-secondary-foreground"
        >
          {initialsOf(fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">{fullName}</p>
          <p className="truncate text-caption text-muted-foreground">{roleLabel}</p>
        </div>
      </div>
      <SignOutButton variant="ghost" />
    </>
  );
}

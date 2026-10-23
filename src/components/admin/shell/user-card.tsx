import { SignOutButton } from '@/components/auth/sign-out-button';
import { cn } from '@/lib/utils/cn';

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

export function StaffAvatar({ fullName, className }: { fullName: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-body-sm font-semibold text-secondary-foreground',
        className,
      )}
    >
      {initialsOf(fullName)}
    </span>
  );
}

// The sidebar footer (docs/StyleGuide.md §6.1): who is signed in, in which role, and `Keluar`. Initials stand in for
// the avatar until profiles can upload one (Task P4.8.03). On the icon rail only the avatar stays.
export function UserCard({ fullName, roleLabel }: UserCardProps) {
  return (
    <>
      <div className="flex items-center gap-3 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <StaffAvatar fullName={fullName} />
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-body-sm font-medium">{fullName}</p>
          <p className="truncate text-caption text-muted-foreground">{roleLabel}</p>
        </div>
      </div>
      <SignOutButton variant="ghost" className="group-data-[collapsible=icon]:hidden" />
    </>
  );
}

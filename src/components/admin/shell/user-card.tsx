import { LogOut } from 'lucide-react';
import Link from 'next/link';

import { SIGN_OUT_PATH } from '@/config/auth';
import { PROFILE_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
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
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-caption font-semibold text-foreground',
        className,
      )}
    >
      {initialsOf(fullName)}
    </span>
  );
}

// The sidebar footer (docs/StyleGuide.md §6.1, Dasbor Gelap): who is signed in and in which role, a link to `Profil`,
// and `Keluar`, a plain form post to auth/signout that works before any script has loaded. Initials stand in for the
// avatar. On the icon rail only the avatar stays.
export function UserCard({ fullName, roleLabel }: UserCardProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-sidebar-border p-1 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0">
      <Link
        href={PROFILE_PATH}
        aria-label={`${copy.dashboard.userMenu.profile}: ${fullName}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <StaffAvatar fullName={fullName} />
        <span className="min-w-0 group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-caption font-semibold text-foreground">
            {fullName}
          </span>
          <span className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />
            {roleLabel}
          </span>
        </span>
      </Link>
      <form action={SIGN_OUT_PATH} method="post" className="group-data-[collapsible=icon]:hidden">
        <button
          type="submit"
          aria-label={copy.auth.mfa.signOut}
          title={copy.auth.mfa.signOut}
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring md:size-9"
        >
          <LogOut aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  );
}

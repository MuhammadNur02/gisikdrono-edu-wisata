'use client';

import { LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';

import { StaffAvatar } from '@/components/admin/shell/user-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SIGN_OUT_PATH } from '@/config/auth';
import { PROFILE_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';

const text = copy.dashboard.userMenu;

const THEMES = [
  { value: 'light', label: text.themes.light, icon: Sun },
  { value: 'dark', label: text.themes.dark, icon: Moon },
  { value: 'system', label: text.themes.system, icon: Monitor },
] as const;

export interface UserMenuProps {
  fullName: string;
  roleLabel: string;
}

// The theme choice (default `system`, docs/StyleGuide.md §2.6), kept by next-themes under the dashboard's own key.
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel className="text-caption font-normal text-muted-foreground">
        {text.theme}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
        {THEMES.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <option.icon aria-hidden className="mr-2 size-4" />
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

// docs/StyleGuide.md §6.1: the avatar menu of the topbar, with `Profil`, the theme and `Keluar`. Signing out posts a
// plain form to auth/signout, as the sidebar button does.
export function UserMenu({ fullName, roleLabel }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={text.label} className="rounded-full">
          <StaffAvatar fullName={fullName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-body-sm font-medium">{fullName}</span>
          <span className="block truncate text-caption font-normal text-muted-foreground">
            {roleLabel}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={PROFILE_PATH}>
              <UserRound aria-hidden />
              {text.profile}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeChoice />
        <DropdownMenuSeparator />
        <form action={SIGN_OUT_PATH} method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              {copy.auth.mfa.signOut}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
